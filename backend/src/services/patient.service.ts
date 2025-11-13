import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, count, isNotNull, or, ilike, and } from 'drizzle-orm';
import * as distributedSchema from '../db/schema/distributed/schema';
import * as distributedRelations from '../db/schema/distributed/relations';
import { organizationUserTable, patientProfileTable } from '../db/schema/distributed/schema';
import jwtService from './jwt.service';
import cryptoService from '../utils/crypto';
import { OrgJWTPayload } from '../config/jwt.config';
import { emailService } from './email.service';
import type { OrganizationUserWithProfile } from '../middleware/auth';

// Type for organization user with populated profile
type UserLike = OrganizationUserWithProfile;
type OrgDatabase = NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;

class PatientService {
  async registerPatient(db: OrgDatabase, patientData: any, ipAddress: string, organizationName: string) {
    // Check if a user with the provided email already exists
    const existingUser = await db
      .select()
      .from(organizationUserTable)
      .where(eq(organizationUserTable.email, patientData.email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists in the organization');
    }

    // Hash the password
    const hashedPassword = await jwtService.hashPassword(patientData.password);

    // Parse dateOfBirth string to Date object, assuming YYYY-MM-DD and treating as UTC
    const dob = new Date(`${patientData.dateOfBirth}T00:00:00.000Z`);

    let txResult: { organizationUser: any; patientProfile: any } | undefined;
    try {
      txResult = await db.transaction(async (tx) => {
        // Create PatientProfile entity
        const patientProfileRows = await tx.insert(patientProfileTable).values({
          dateOfBirth: dob,
          phoneNumber: patientData.phoneNumber,
          ipAddress,
          address: patientData.address ?? null,
          emergencyContactName: patientData.emergencyContactName ?? null,
          emergencyContactPhone: patientData.emergencyContactPhone ?? null,
          bloodType: patientData.bloodType ?? null,
          allergies: patientData.allergies ?? null,
          chronicConditions: patientData.chronicConditions ?? null,
        }).returning();

        if (patientProfileRows.length === 0) {
          throw new Error('Failed to create PatientProfile');
        }
        const patientProfile = patientProfileRows[0];

        // Create OrganizationUser entity with patientProfile
        const organizationUserRows = await tx.insert(organizationUserTable).values({
          email: patientData.email,
          password: hashedPassword,
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          patientProfileId: patientProfile!.id,
        }).returning();

        if (organizationUserRows.length === 0) {
          throw new Error('Failed to create OrganizationUser');
        }
        const organizationUser = organizationUserRows[0];

        return { organizationUser, patientProfile };
      });
    } catch (error: any) {
      if (error.code === '23505') { // Postgres unique violation
        throw new Error('User with this email already exists in the organization');
      }
      throw error;
    }

    if (!txResult) {
      throw new Error('Transaction failed to produce result');
    }
    const { organizationUser } = txResult;


    // Generate JWT tokens
    const payload: OrgJWTPayload = {
      userId: organizationUser.id,
      email: organizationUser.email,
      name: `${organizationUser.firstName} ${organizationUser.lastName}`,
      type: 'org',
      orgName: organizationName
    };

    const { accessToken, refreshToken, refreshTokenPlain } = jwtService.generateTokenPair(payload);

    // Store hashed refresh token on user entity
    await db.update(organizationUserTable)
      .set({
        refreshToken: await cryptoService.hashRefreshToken(refreshTokenPlain),
        updatedAt: new Date(),
      })
      .where(eq(organizationUserTable.id, organizationUser.id));

    // Send welcome email (don't block on failure)
    try {
      await emailService.sendPatientRegistrationEmail({
        to: organizationUser.email,
        patientName: `${organizationUser.firstName} ${organizationUser.lastName}`,
        organizationName,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with response even if email fails
    }

    // Return the created user information with tokens
    return {
      accessToken,
      refreshToken,
      user: {
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: 'patient',
      },
    };
  }

  async getAllPatients(db: OrgDatabase, searchQuery: string | undefined, limit: number, offset: number) {
    // Build where condition for count query
    const buildCountWhere = () => {
      const baseCondition = isNotNull(organizationUserTable.patientProfileId);

      if (!searchQuery) {
        return baseCondition;
      }

      // Case-insensitive search on firstName, lastName, or email
      const searchPattern = `%${searchQuery}%`;
      return and(
        baseCondition,
        or(
          ilike(organizationUserTable.firstName, searchPattern),
          ilike(organizationUserTable.lastName, searchPattern),
          ilike(organizationUserTable.email, searchPattern)
        )
      );
    };

    // Get total count with the same filters using aggregate count
    const countResult = await db.select({ value: count() })
      .from(organizationUserTable)
      .where(buildCountWhere());
    const total = Number(countResult[0]?.value || 0);

    // Get paginated patients with server-side LIMIT and OFFSET
    const patients = await db.query.organizationUserTable.findMany({
      where: (users, { isNotNull: isNotNullOp, or: orOp, ilike: ilikeOp, and: andOp }) => {
        const baseCondition = isNotNullOp(users.patientProfileId);

        if (!searchQuery) {
          return baseCondition;
        }

        // Case-insensitive search on firstName, lastName, or email
        const searchPattern = `%${searchQuery}%`;
        return andOp(
          baseCondition,
          orOp(
            ilikeOp(users.firstName, searchPattern),
            ilikeOp(users.lastName, searchPattern),
            ilikeOp(users.email, searchPattern)
          )
        );
      },
      with: {
        patientProfile: true,
      },
      limit,
      offset,
    });

    // Map to response shape - type assertion needed for joined relations
    type PatientWithProfile = typeof patients[0] & {
      patientProfile: NonNullable<typeof patients[0]['patientProfile']>;
    };

    const mappedPatients = patients
      .filter((user): user is PatientWithProfile => user.patientProfile !== null && user.patientProfile !== undefined)
      .map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'patient' as const,
        dateOfBirth: user.patientProfile.dateOfBirth,
        phoneNumber: user.patientProfile.phoneNumber,
        address: user.patientProfile.address,
        emergencyContactName: user.patientProfile.emergencyContactName,
        emergencyContactPhone: user.patientProfile.emergencyContactPhone,
        bloodType: user.patientProfile.bloodType,
        allergies: user.patientProfile.allergies,
        chronicConditions: user.patientProfile.chronicConditions,
      }));

    return {
      patients: mappedPatients,
      total,
      limit,
      offset,
    };
  }

  async getPatientProfile(user: UserLike) {
    if (!user.patientProfile) {
      throw new Error('User does not have a patient profile');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.patientProfile.dateOfBirth,
      phoneNumber: user.patientProfile.phoneNumber,
      address: user.patientProfile.address,
      emergencyContactName: user.patientProfile.emergencyContactName,
      emergencyContactPhone: user.patientProfile.emergencyContactPhone,
      bloodType: user.patientProfile.bloodType,
      allergies: user.patientProfile.allergies,
      chronicConditions: user.patientProfile.chronicConditions,
    };
  }

  async updatePatientProfile(db: OrgDatabase, user: UserLike, updateData: any, ipAddress: string) {
    if (!user.patientProfile) {
      throw new Error('User or patient profile not found');
    }
    const patientProfileId = user.patientProfile!.id;

    const userUpdates: { firstName?: string; lastName?: string; updatedAt?: Date } = {};
    if (updateData.firstName) userUpdates.firstName = updateData.firstName;
    if (updateData.lastName) userUpdates.lastName = updateData.lastName;

    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updatedAt = new Date();
      await db.update(organizationUserTable)
        .set(userUpdates)
        .where(eq(organizationUserTable.id, user.id));
    }

    const profileUpdates: { [key: string]: any } = {
      ipAddress,
      updatedAt: new Date(),
    };

    if (updateData.dateOfBirth) profileUpdates.dateOfBirth = new Date(`${updateData.dateOfBirth}T00:00:00.000Z`);
    if (updateData.phoneNumber) profileUpdates.phoneNumber = updateData.phoneNumber;
    if (updateData.address !== undefined) profileUpdates.address = updateData.address;
    if (updateData.emergencyContactName !== undefined) profileUpdates.emergencyContactName = updateData.emergencyContactName;
    if (updateData.emergencyContactPhone !== undefined) profileUpdates.emergencyContactPhone = updateData.emergencyContactPhone;
    if (updateData.bloodType !== undefined) profileUpdates.bloodType = updateData.bloodType;
    if (updateData.allergies !== undefined) profileUpdates.allergies = updateData.allergies;
    if (updateData.chronicConditions !== undefined) profileUpdates.chronicConditions = updateData.chronicConditions;

    await db.update(patientProfileTable)
      .set(profileUpdates)
      .where(eq(patientProfileTable.id, patientProfileId));

    // Reload the user with profile
    const results = await db
      .select()
      .from(organizationUserTable)
      .leftJoin(patientProfileTable, eq(organizationUserTable.patientProfileId, patientProfileTable.id))
      .where(eq(organizationUserTable.id, user.id))
      .limit(1);

    if (results.length === 0) {
      throw new Error('User or patient profile not found');
    }

    const updatedUserResult = results[0];
    
    if (!updatedUserResult) {
      throw new Error('User or patient profile not found');
    }

    const reloadedUser: UserLike = {
      ...updatedUserResult.organization_user,
      // The other profiles will be null/undefined, which is fine for UserLike
      adminProfile: null,
      doctorProfile: null,
      patientProfile: updatedUserResult.patient_profile,
    };

    return this.getPatientProfile(reloadedUser);
  }

  async deletePatientAccount(db: OrgDatabase, user: UserLike, organizationName: string) {
    if (!user.patientProfile) {
      throw new Error('User or patient profile not found');
    }

    await db.transaction(async (tx) => {
      // Clear the refresh token
      await tx.update(organizationUserTable)
        .set({ refreshToken: null, updatedAt: new Date() })
        .where(eq(organizationUserTable.id, user.id));

      // Delete the user record
      await tx.delete(organizationUserTable)
        .where(eq(organizationUserTable.id, user.id));

      // Delete the patient profile record
      if (user.patientProfile) {
        await tx.delete(patientProfileTable)
          .where(eq(patientProfileTable.id, user.patientProfile.id));
      }
    });

    // Send deletion confirmation email (don't block on failure)
    try {
      await emailService.sendPatientDeletionEmail({
        to: user.email,
        patientName: `${user.firstName} ${user.lastName}`,
        organizationName,
      });
    } catch (emailError) {
      console.error('Failed to send deletion confirmation email:', emailError);
      // Continue even if email fails
    }
  }
}

export default new PatientService();