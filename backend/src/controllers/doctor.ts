import { Request, Response } from "express";
import BaseController from "./base";
import OrganizationUser from "../entities/distributed/organization_user";
import DoctorProfile from "../entities/distributed/doctor_profile";
import jwtService from "../services/jwt.service";
import { RequestContext } from "@mikro-orm/core";
import { CreateDoctorDto } from "../validators/doctor";

class DoctorController extends BaseController {
  async createDoctor(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, specialization, licenseNumber, phoneNumber } = req.body as CreateDoctorDto;

      // Get the organization-specific EntityManager
      const em = RequestContext.getEntityManager();
      if (!em) {
        res.status(500).json({ error: "Database context not available" });
        return;
      }

      // Check if a user with the provided email already exists
      const existingUser = await em.findOne(OrganizationUser, { email });
      if (existingUser) {
        res.status(409).json({
          error: "User with this email already exists in the organization",
        });
        return;
      }

      // Hash the password
      const hashedPassword = await jwtService.hashPassword(password);

      // Create DoctorProfile entity
      const doctorProfileData: any = {
        specialization,
        licenseNumber,
      };

      // Only include phoneNumber if it's provided
      if (phoneNumber) {
        doctorProfileData.phoneNumber = phoneNumber;
      }

      const doctorProfile = em.create(DoctorProfile, doctorProfileData);

      // Create OrganizationUser entity with doctorProfile
      const organizationUser = em.create(OrganizationUser, {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        doctorProfile,
      });

      // Persist both entities
      await em.persistAndFlush([doctorProfile, organizationUser]);

      // Return the created user information
      res.status(201).json({
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: "doctor",
        specialization,
        licenseNumber,
      });
    } catch (error) {
      console.error("Failed to create doctor user:", error);
      res.status(500).json({ error: "Failed to create doctor user" });
    }
  }
}

export default new DoctorController();
