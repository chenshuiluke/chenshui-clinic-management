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

      const hashedPassword = await jwtService.hashPassword(password);

      const doctorProfile = em.create(DoctorProfile, {
        specialization,
        licenseNumber,
        ...(phoneNumber && { phoneNumber }),
      });

      const organizationUser = em.create(OrganizationUser, {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        doctorProfile,
      });

      await em.persistAndFlush([doctorProfile, organizationUser]);

      res.status(201).json({
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: "doctor",
        specialization,
        licenseNumber,
      });
    } catch (error: any) {
      console.error("Failed to create doctor user:", error);
      res.status(500).json({ error: "Failed to create doctor user" });
    }
  }
}

export default new DoctorController();
