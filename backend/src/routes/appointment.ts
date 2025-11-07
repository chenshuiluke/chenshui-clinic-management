import { Router } from 'express';
import appointmentController from '../controllers/appointment';
import { validateRequest } from '../middleware/validator';
import { requirePatient } from '../middleware/auth';
import { bookAppointmentSchema } from '../validators/appointment';

const router = Router();

// Protected endpoint for booking an appointment
router.post('/', requirePatient, validateRequest(bookAppointmentSchema), (req, res) =>
  appointmentController.bookAppointment(req, res)
);

// Protected endpoint for viewing appointment history
router.get('/me', requirePatient, (req, res) =>
  appointmentController.getMyAppointments(req, res)
);

export default router;
