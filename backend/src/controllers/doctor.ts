import { Request, Response } from "express";
import BaseController from "./base";
import jwtService from "../services/jwt.service";
import { CreateDoctorDto } from "../validators/doctor";
import { eq, isNotNull } from "drizzle-orm";
import { doctorProfileTable, organizationUserTable } from "../db/schema/distributed/schema";
import { DoctorProfile, NewDoctorProfile, NewOrganizationUser, OrganizationUser } from "../db/schema/distributed/types";

class DoctorController extends BaseController {
  async getAllDoctors(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);

      // Query OrganizationUser entities with doctorProfile populated
      const doctors = await db.query.organizationUserTable.findMany({
        where: (users, { isNotNull }) => isNotNull(users.doctorProfileId),
        with: {
          doctorProfile: true,
        },
      });

      // Map to response shape
      const mappedDoctors = doctors
        .filter(user => user.doctorProfile)
        .map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'doctor' as const,
          specialization: user.doctorProfile!.specialization,
          licenseNumber: user.doctorProfile!.licenseNumber,
          ...(user.doctorProfile!.phoneNumber && { phoneNumber: user.doctorProfile!.phoneNumber }),
        }));

      res.status(200).json(mappedDoctors);
    } catch (error: any) {
      console.error("Failed to fetch doctors:", error);
      res.status(500).json({ error: "Failed to fetch doctors" });
    }
  }

  async createDoctor(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, specialization, licenseNumber, phoneNumber } = req.body as CreateDoctorDto;

      const db = this.getDb(req);

      // Check if a user with the provided email already exists
      const existingUsers = await db.select().from(organizationUserTable).where(eq(organizationUserTable.email, email)).limit(1);
      const existingUser = existingUsers.length > 0 ? existingUsers[0] : null;
      if (existingUser) {
        res.status(409).json({
          error: "User with this email already exists in the organization",
        });
        return;
      }

      const hashedPassword = await jwtService.hashPassword(password);

      const result = await db.transaction(async (tx) => {
        // Create DoctorProfile first
        const doctorProfiles = await tx.insert(doctorProfileTable).values({
          specialization,
          licenseNumber,
          phoneNumber: phoneNumber || null,
        }).returning();

        if (doctorProfiles.length === 0) {
          throw new Error("Failed to create doctor profile.");
        }
        const doctorProfile = doctorProfiles[0];

        // Create OrganizationUser with reference to doctorProfile
        const organizationUsers = await tx.insert(organizationUserTable).values({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          doctorProfileId: doctorProfile!.id,
        }).returning();

        if (organizationUsers.length === 0) {
          throw new Error("Failed to create organization user.");
        }
        const organizationUser = organizationUsers[0];

        return { doctorProfile, organizationUser };
      });

      const { doctorProfile, organizationUser } = result;

      res.status(201).json({
        id: organizationUser!.id,
        email: organizationUser!.email,
        firstName: organizationUser!.firstName,
        lastName: organizationUser!.lastName,
        role: "doctor",
        specialization: doctorProfile!.specialization,
        licenseNumber: doctorProfile!.licenseNumber,
        ...(doctorProfile!.phoneNumber && { phoneNumber: doctorProfile!.phoneNumber }),
      });
    } catch (error: any) {
      console.error("Failed to create doctor user:", error);
      res.status(500).json({ error: "Failed to create doctor user" });
    }
  }
}

export default new DoctorController();
