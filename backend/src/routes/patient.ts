import { Router } from 'express';
import patientController from '../controllers/patient';
import { validateRequest } from '../middleware/validator';
import { requirePatient } from '../middleware/auth';
import { patientRegisterSchema, updatePatientProfileSchema } from '../validators/patient';

const router = Router();

// Public endpoint for patient self-registration
router.post('/register', validateRequest(patientRegisterSchema), (req, res) =>
  patientController.register(req, res)
);

// Protected endpoint for viewing patient profile
router.get('/me', requirePatient, (req, res) =>
  patientController.getProfile(req, res)
);

// Protected endpoint for updating patient profile
router.put('/me', requirePatient, validateRequest(updatePatientProfileSchema), (req, res) =>
  patientController.updateProfile(req, res)
);

export default router;
