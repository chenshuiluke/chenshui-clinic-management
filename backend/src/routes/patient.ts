import { Router } from 'express';
import patientController from '../controllers/patient';
import { validateRequest } from '../middleware/validator';
import { requirePatient, rejectAuthOnOpenEndpoint } from '../middleware/auth';
import { patientRegisterSchema, updatePatientProfileSchema } from '../validators/patient';

const router = Router();

router.post('/register', rejectAuthOnOpenEndpoint, validateRequest(patientRegisterSchema), (req, res) =>
  patientController.register(req, res)
);

router.get('/me', requirePatient, (req, res) =>
  patientController.getProfile(req, res)
);

router.put('/me', requirePatient, validateRequest(updatePatientProfileSchema), (req, res) =>
  patientController.updateProfile(req, res)
);

router.delete('/me', requirePatient, (req, res) =>
  patientController.deleteAccount(req, res)
);

export default router;
