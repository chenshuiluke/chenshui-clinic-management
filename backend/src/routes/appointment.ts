import { Router } from 'express';
import appointmentController from '../controllers/appointment';
import { validateRequest } from '../middleware/validator';
import { requirePatient, requireDoctor } from '../middleware/auth';
import {
  bookAppointmentSchema,
  appointmentIdParamSchema,
  appointmentQuerySchema,
  doctorAppointmentQuerySchema,
  updateAppointmentStatusSchema
} from '../validators/appointment';
import { validate } from '../middleware/validator';

const router = Router();

router.get('/', requireDoctor, validate(doctorAppointmentQuerySchema, 'query'), (req, res) =>
  appointmentController.getDoctorAppointments(req, res)
);

router.post('/', requirePatient, validateRequest(bookAppointmentSchema), (req, res) =>
  appointmentController.bookAppointment(req, res)
);

router.get('/me', requirePatient, validate(appointmentQuerySchema, 'query'), (req, res) =>
  appointmentController.getMyAppointments(req, res)
);

router.get('/pending', requireDoctor, validate(appointmentQuerySchema, 'query'), (req, res) =>
  appointmentController.getPendingAppointments(req, res)
);

router.put('/:id/approve', validate(appointmentIdParamSchema, 'params'), requireDoctor, (req, res) =>
  appointmentController.approveAppointment(req, res)
);

router.put('/:id/decline', validate(appointmentIdParamSchema, 'params'), requireDoctor, (req, res) =>
  appointmentController.declineAppointment(req, res)
);

router.put('/:id/cancel', validate(appointmentIdParamSchema, 'params'), requirePatient, (req, res) =>
  appointmentController.cancelAppointment(req, res)
);

router.put('/:id/complete', validate(appointmentIdParamSchema, 'params'), requireDoctor, (req, res) =>
  appointmentController.completeAppointment(req, res)
);

export default router;
