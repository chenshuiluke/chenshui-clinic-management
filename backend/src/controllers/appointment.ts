import { Request, Response } from 'express';
import BaseController from './base';
import { BookAppointmentDto, AppointmentQueryDto, DoctorAppointmentQueryDto } from '../validators/appointment';
import appointmentService from '../services/appointment.service';
import { AppointmentStatusType } from '../db/schema/distributed/enums';

class AppointmentController extends BaseController {
  /**
   * Maps service error messages to HTTP status codes
   */
  private mapErrorToStatus(errorMessage: string): number {
    const errorMap: Record<string, number> = {
      'Doctor not found': 404,
      'User is not a doctor': 404,
      'Appointment not found': 404,
      'Not authorized to approve this appointment': 403,
      'Not authorized to decline this appointment': 403,
      'Not authorized to complete this appointment': 403,
      'Not authorized to cancel this appointment': 403,
      'Only pending appointments can be approved': 400,
      'Only pending appointments can be declined': 400,
      'Only approved appointments can be marked as completed': 400,
      'Cannot cancel completed, declined, or already cancelled appointments': 400,
      'Invalid appointment date format. Use ISO 8601 (e.g., 2024-12-01T10:00:00Z)': 400,
      'Appointment date must be in the future': 400,
      'Failed to create appointment': 500,
    };
    return errorMap[errorMessage] || 500;
  }
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
          this.getDb(req),
          patient,
          doctorId,
          appointmentDateTime,
          notes
        );
        res.status(201).json(result);
      } catch (error: any) {
        const statusCode = this.mapErrorToStatus(error.message);
        res.status(statusCode).json({ error: error.message });
        return;
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

      // Parse query parameters to numbers with defaults
      const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
      const parsedOffset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;

      const limit = parsedLimit !== undefined && !isNaN(parsedLimit) ? parsedLimit : 10;
      const offset = parsedOffset !== undefined && !isNaN(parsedOffset) ? parsedOffset : 0;

      const result = await appointmentService.getPatientAppointments(
        this.getDb(req),
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

      // Parse query parameters to numbers with defaults
      const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
      const parsedOffset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;

      const limit = parsedLimit !== undefined && !isNaN(parsedLimit) ? parsedLimit : 10;
      const offset = parsedOffset !== undefined && !isNaN(parsedOffset) ? parsedOffset : 0;

      // Validate status parameter
      const validStatuses: AppointmentStatusType[] = ['PENDING', 'APPROVED', 'DECLINED', 'COMPLETED', 'CANCELLED'];
      const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
      const status: AppointmentStatusType | undefined =
        statusParam && validStatuses.includes(statusParam as AppointmentStatusType)
          ? (statusParam as AppointmentStatusType)
          : undefined;

      const result = await appointmentService.getDoctorAppointments(
        this.getDb(req),
        doctor,
        limit,
        offset,
        status
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

      // Parse query parameters to numbers with defaults
      const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
      const parsedOffset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;

      const limit = parsedLimit !== undefined && !isNaN(parsedLimit) ? parsedLimit : 10;
      const offset = parsedOffset !== undefined && !isNaN(parsedOffset) ? parsedOffset : 0;

      const result = await appointmentService.getDoctorPendingAppointments(
        this.getDb(req),
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
        const result = await appointmentService.approveAppointment(this.getDb(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        const statusCode = this.mapErrorToStatus(error.message);
        res.status(statusCode).json({ error: error.message });
        return;
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
        const result = await appointmentService.declineAppointment(this.getDb(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        const statusCode = this.mapErrorToStatus(error.message);
        res.status(statusCode).json({ error: error.message });
        return;
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
        const result = await appointmentService.cancelAppointment(this.getDb(req), id, patient);
        res.status(200).json(result);
      } catch (error: any) {
        const statusCode = this.mapErrorToStatus(error.message);
        res.status(statusCode).json({ error: error.message });
        return;
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
        const result = await appointmentService.completeAppointment(this.getDb(req), id, doctor);
        res.status(200).json(result);
      } catch (error: any) {
        const statusCode = this.mapErrorToStatus(error.message);
        res.status(statusCode).json({ error: error.message });
        return;
      }
    } catch (error: any) {
      console.error('Failed to complete appointment:', error);
      res.status(500).json({ error: 'Failed to complete appointment' });
    }
  }
}

export default new AppointmentController();