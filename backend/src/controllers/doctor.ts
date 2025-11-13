import { Request, Response } from "express";
import BaseController from "./base";
import doctorService from "../services/doctor.service";
import { CreateDoctorDto } from "../validators/doctor";

class DoctorController extends BaseController {
  async getAllDoctors(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      const doctors = await doctorService.getAllDoctors(db);
      res.status(200).json(doctors);
    } catch (error: any) {
      console.error("Failed to fetch doctors:", error);
      res.status(500).json({ error: "Failed to fetch doctors" });
    }
  }

  async createDoctor(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, specialization, licenseNumber, phoneNumber } = req.body as CreateDoctorDto;
      const db = this.getDb(req);

      const doctor = await doctorService.createDoctor(db, {
        email,
        password,
        firstName,
        lastName,
        specialization,
        licenseNumber,
        ...(phoneNumber !== undefined && { phoneNumber }),
      });

      res.status(201).json(doctor);
    } catch (error: any) {
      console.error("Failed to create doctor user:", error);

      if (error.message && error.message.includes("already exists")) {
        res.status(409).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: "Failed to create doctor user" });
    }
  }
}

export default new DoctorController();
