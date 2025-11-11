import { Request, Response } from 'express';
import BaseController from './base';
import { BookAppointmentDto, AppointmentQueryDto, DoctorAppointmentQueryDto } from '../validators/appointment';
import appointmentService from '../services/appointment.service';

class AppointmentController extends BaseController {
  async bookAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { doctorId, appointmentDateTime, notes } = req.body as BookAppointmentDto;

      const patient = req.organizationUser;
      if (!patient) {
        res.status(401).json({ error: 'Patient not authenticated' });
        return;
      }

      try {
        const result = await appointmentService.bookAppointment(
          this.getEm(req),
          patient,
          doctorId,
          appointmentDateTime,
          notes
        );
        res.status(201).json(result);
      } catch (error: any) {
        if (error.message === 'Doctor not found' || error.message === 'User is not a doctor') {
          res.status(404).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to book appointment:', error);
      res.status(500).json({ error: 'Failed to book appointment' });
    }
  }

  async getMyAppointments(req: Request, res: Response): Promise<void> {
    try {
      const patient = req.organizationUser;
      if (!patient) {
        res.status(401).json({ error: 'Patient not authenticated' });
        return;
      }

      // Use validated and transformed values from query
      const { limit, offset } = req.query as unknown as AppointmentQueryDto;

      const result = await appointmentService.getPatientAppointments(
        this.getEm(req),
        patient,
        limit,
        offset
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error('Failed to get appointments:', error);
      res.status(500).json({ error: 'Failed to get appointments' });
    }
  }

  async getDoctorAppointments(req: Request, res: Response): Promise<void> {
    try {
      const doctor = req.organizationUser;
      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      // Use validated and transformed values from query
      const { limit, offset, status } = req.query as unknown as DoctorAppointmentQueryDto;

      const result = await appointmentService.getDoctorAppointments(
        this.getEm(req),
        doctor,
        limit,
        offset,
        status as any
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error('Failed to get doctor appointments:', error);
      res.status(500).json({ error: 'Failed to get doctor appointments' });
    }
  }

  async getPendingAppointments(req: Request, res: Response): Promise<void> {
    try {
      const doctor = req.organizationUser;
      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      // Use validated and transformed values from query
      const { limit, offset } = req.query as unknown as AppointmentQueryDto;

      const result = await appointmentService.getDoctorPendingAppointments(
        this.getEm(req),
        doctor,
        limit,
        offset
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error('Failed to get pending appointments:', error);
      res.status(500).json({ error: 'Failed to get pending appointments' });
    }
  }

  async approveAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      try {
        const result = await appointmentService.approveAppointment(this.getEm(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        if (error.message === 'Appointment not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message === 'Not authorized to approve this appointment') {
          res.status(403).json({ error: error.message });
          return;
        }
        if (error.message === 'Only pending appointments can be approved') {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to approve appointment:', error);
      res.status(500).json({ error: 'Failed to approve appointment' });
    }
  }

  async declineAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      try {
        const result = await appointmentService.declineAppointment(this.getEm(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        if (error.message === 'Appointment not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message === 'Not authorized to decline this appointment') {
          res.status(403).json({ error: error.message });
          return;
        }
        if (error.message === 'Only pending appointments can be declined') {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to decline appointment:', error);
      res.status(500).json({ error: 'Failed to decline appointment' });
    }
  }

  async cancelAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const patient = req.organizationUser;

      if (!patient) {
        res.status(401).json({ error: 'Patient not authenticated' });
        return;
      }

      try {
        const result = await appointmentService.cancelAppointment(this.getEm(req), id, patient);
        res.status(200).json(result);
      } catch (error: any) {
        if (error.message === 'Appointment not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message === 'Not authorized to cancel this appointment') {
          res.status(403).json({ error: error.message });
          return;
        }
        if (error.message === 'Cannot cancel completed, declined, or already cancelled appointments') {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to cancel appointment:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  }

  async completeAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      try {
        const result = await appointmentService.completeAppointment(this.getEm(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        if (error.message === 'Appointment not found') {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message === 'Not authorized to complete this appointment') {
          res.status(403).json({ error: error.message });
          return;
        }
        if (error.message === 'Only approved appointments can be marked as completed') {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to complete appointment:', error);
      res.status(500).json({ error: 'Failed to complete appointment' });
    }
  }
}

export default new AppointmentController();