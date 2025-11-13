import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, isNotNull } from 'drizzle-orm';
import * as distributedSchema from '../db/schema/distributed/schema';
import * as distributedRelations from '../db/schema/distributed/relations';
import { doctorProfileTable, organizationUserTable } from '../db/schema/distributed/schema';
import {
  DoctorProfile,
  NewDoctorProfile,
  OrganizationUser,
  NewOrganizationUser,
} from '../db/schema/distributed/types';
import jwtService from './jwt.service';

type OrgDatabase = NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;

class DoctorService {
  async getAllDoctors(db: OrgDatabase) {
    const users = await db.query.organizationUserTable.findMany({
      where: isNotNull(distributedSchema.organizationUserTable.doctorProfileId),
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      with: {
        doctorProfile: {
          columns: {
            specialization: true,
            licenseNumber: true,
            phoneNumber: true,
          },
        },
      },
    });

    return users
      .filter((user) => user.doctorProfile)
      .map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'doctor' as const,
        specialization: user.doctorProfile!.specialization,
        licenseNumber: user.doctorProfile!.licenseNumber,
        ...(user.doctorProfile!.phoneNumber && { phoneNumber: user.doctorProfile!.phoneNumber }),
      }));
  }

  async createDoctor(
    db: OrgDatabase,
    doctorData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      specialization: string;
      licenseNumber: string;
      phoneNumber?: string;
    }
  ) {
    const { email, password, firstName, lastName, specialization, licenseNumber, phoneNumber } =
      doctorData;

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(organizationUserTable)
      .where(eq(organizationUserTable.email, normalizedEmail))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists in the organization');
    }

    // Hash password
    const hashedPassword = await jwtService.hashPassword(password);

    // Create doctor profile and user in a transaction
    try {
      const { doctorProfile, organizationUser } = await db.transaction(async (tx) => {
        // Create doctor profile
        const doctorProfileResult = await tx
          .insert(doctorProfileTable)
          .values({
            specialization,
            licenseNumber,
            phoneNumber: phoneNumber || null,
          })
          .returning();

        if (!doctorProfileResult || doctorProfileResult.length === 0) {
          throw new Error('Failed to create doctor profile');
        }

        const doctorProfile = doctorProfileResult[0];

        if (!doctorProfile) {
          throw new Error('Failed to create doctor profile');
        }

        // Create organization user
        const organizationUserResult = await tx
          .insert(organizationUserTable)
          .values({
            email: normalizedEmail,
            password: hashedPassword,
            firstName,
            lastName,
            doctorProfileId: doctorProfile.id,
          })
          .returning();

        if (!organizationUserResult || organizationUserResult.length === 0) {
          throw new Error('Failed to create organization user');
        }

        const organizationUser = organizationUserResult[0];

        return { doctorProfile, organizationUser };
      });

      // Verify both entities were created
      if (!doctorProfile || !organizationUser) {
        throw new Error('Failed to create doctor profile or organization user');
      }

      // Return structured response
      return {
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: 'doctor' as const,
        specialization: doctorProfile.specialization,
        licenseNumber: doctorProfile.licenseNumber,
        ...(doctorProfile.phoneNumber && { phoneNumber: doctorProfile.phoneNumber }),
      };
    } catch (error: any) {
      // Check for Postgres unique constraint violation
      if (
        error.code === '23505' &&
        (error.constraint === 'organization_user_email_unique' ||
          error.constraint === 'organization_user_email_key' ||
          error.message?.includes('organization_user_email_unique') ||
          error.message?.includes('organization_user_email_key'))
      ) {
        throw new Error('User with this email already exists in the organization');
      }
      // Rethrow original error if not a unique constraint violation
      throw error;
    }
  }
}

export default new DoctorService();
