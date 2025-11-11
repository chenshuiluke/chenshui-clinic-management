import { Router } from "express";
import doctorController from "../controllers/doctor";
import { validateRequest } from "../middleware/validator";
import { requireAdmin } from "../middleware/auth";
import { createDoctorSchema } from "../validators/doctor";

const router = Router();

router.get("/", requireAdmin, (req, res) =>
  doctorController.getAllDoctors(req, res)
);

router.post("/", requireAdmin, validateRequest(createDoctorSchema), (req, res) =>
  doctorController.createDoctor(req, res)
);

export default router;
