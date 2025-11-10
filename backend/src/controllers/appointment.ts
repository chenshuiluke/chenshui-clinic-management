import { Request, Response } from 'express';
import BaseController from './base';
import Appointment, { AppointmentStatus } from '../entities/distributed/appointment';
import OrganizationUser from '../entities/distributed/organization_user';
import { BookAppointmentDto } from '../validators/appointment';

class AppointmentController extends BaseController {
  async bookAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { doctorId, appointmentDateTime, notes } = req.body as BookAppointmentDto;

      const patient = req.organizationUser;
      if (!patient) {
        res.status(401).json({ error: 'Patient not authenticated' });
        return;
      }

      const doctor = await this.em.findOne(OrganizationUser, { id: doctorId }, {
        populate: ['doctorProfile'],
      });

      if (!doctor) {
        res.status(404).json({ error: 'Doctor not found' });
        return;
      }

      if (!doctor.doctorProfile) {
        res.status(404).json({ error: 'User is not a doctor' });
        return;
      }

      const parsedDate = new Date(appointmentDateTime);

      const appointment = this.em.create(Appointment, {
        patient,
        doctor,
        appointmentDateTime: parsedDate,
        status: AppointmentStatus.PENDING,
        notes: notes ?? null,
      });

      await this.em.persistAndFlush(appointment);

      res.status(201).json({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: appointment.notes,
        doctor: {
          id: doctor.id,
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          specialization: doctor.doctorProfile.specialization,
        },
      });
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

      const appointments = await this.em.find(
        Appointment,
        { patient },
        {
          populate: ['doctor', 'doctor.doctorProfile'],
          orderBy: { appointmentDateTime: 'DESC' },
        }
      );

      res.status(200).json(
        appointments.map((appointment) => ({
          id: appointment.id,
          appointmentDateTime: appointment.appointmentDateTime,
          status: appointment.status,
          notes: appointment.notes,
          doctor: appointment.doctor ? {
            id: appointment.doctor.id,
            firstName: appointment.doctor.firstName,
            lastName: appointment.doctor.lastName,
            specialization: appointment.doctor.doctorProfile?.specialization ?? '',
          } : null,
          createdAt: appointment.createdAt,
        }))
      );
    } catch (error: any) {
      console.error('Failed to get appointments:', error);
      res.status(500).json({ error: 'Failed to get appointments' });
    }
  }

  async getPendingAppointments(req: Request, res: Response): Promise<void> {
    try {
      const doctor = req.organizationUser;
      if (!doctor) {
        res.status(401).json({ error: 'Doctor not authenticated' });
        return;
      }

      const appointments = await this.em.find(
        Appointment,
        { doctor, status: AppointmentStatus.PENDING },
        {
          populate: ['patient', 'patient.patientProfile'],
          orderBy: { appointmentDateTime: 'ASC' },
        }
      );

      const validAppointments = appointments.filter(apt => apt.patient !== null);

      res.status(200).json(
        validAppointments.map((appointment) => ({
          id: appointment.id,
          appointmentDateTime: appointment.appointmentDateTime,
          status: appointment.status,
          notes: appointment.notes ?? '',
          patient: {
            id: appointment.patient!.id,
            firstName: appointment.patient!.firstName,
            lastName: appointment.patient!.lastName,
            dateOfBirth: appointment.patient!.patientProfile?.dateOfBirth ?? '',
            phoneNumber: appointment.patient!.patientProfile?.phoneNumber ?? '',
          },
          createdAt: appointment.createdAt,
        }))
      );
    } catch (error: any) {
      console.error('Failed to get pending appointments:', error);
      res.status(500).json({ error: 'Failed to get pending appointments' });
    }
  }

  async approveAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      const appointment = await this.em.findOne(
        Appointment,
        { id },
        { populate: ['patient', 'doctor'] }
      );

      if (!appointment || !appointment.patient || !appointment.doctor) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.doctor.id !== doctor?.id) {
        res.status(403).json({ error: 'Not authorized to approve this appointment' });
        return;
      }

      if (appointment.status !== AppointmentStatus.PENDING) {
        res.status(400).json({ error: 'Only pending appointments can be approved' });
        return;
      }

      appointment.status = AppointmentStatus.APPROVED;
      await this.em.flush();

      res.status(200).json({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: (appointment.notes || '') as string,
        patient: {
          id: appointment.patient.id,
          firstName: appointment.patient.firstName,
          lastName: appointment.patient.lastName,
        },
      });
    } catch (error: any) {
      console.error('Failed to approve appointment:', error);
      res.status(500).json({ error: 'Failed to approve appointment' });
    }
  }

  async declineAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      const appointment = await this.em.findOne(
        Appointment,
        { id },
        { populate: ['patient', 'doctor'] }
      );

      if (!appointment || !appointment.patient || !appointment.doctor) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.doctor.id !== doctor?.id) {
        res.status(403).json({ error: 'Not authorized to decline this appointment' });
        return;
      }

      if (appointment.status !== AppointmentStatus.PENDING) {
        res.status(400).json({ error: 'Only pending appointments can be declined' });
        return;
      }

      appointment.status = AppointmentStatus.DECLINED;
      await this.em.flush();

      res.status(200).json({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: (appointment.notes || '') as string,
        patient: {
          id: appointment.patient.id,
          firstName: appointment.patient.firstName,
          lastName: appointment.patient.lastName,
        },
      });
    } catch (error: any) {
      console.error('Failed to decline appointment:', error);
      res.status(500).json({ error: 'Failed to decline appointment' });
    }
  }

  async cancelAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const patient = req.organizationUser;

      const appointment = await this.em.findOne(
        Appointment,
        { id },
        { populate: ['patient', 'doctor'] }
      );

      if (!appointment || !appointment.patient) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.patient.id !== patient?.id) {
        res.status(403).json({ error: 'Not authorized to cancel this appointment' });
        return;
      }

      if (
        appointment.status === AppointmentStatus.COMPLETED ||
        appointment.status === AppointmentStatus.DECLINED ||
        appointment.status === AppointmentStatus.CANCELLED
      ) {
        res.status(400).json({ error: 'Cannot cancel completed, declined, or already cancelled appointments' });
        return;
      }

      appointment.status = AppointmentStatus.CANCELLED;
      await this.em.flush();

      res.status(200).json({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        message: 'Appointment cancelled successfully',
      });
    } catch (error: any) {
      console.error('Failed to cancel appointment:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  }

  async completeAppointment(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id!, 10);
      const doctor = req.organizationUser;

      const appointment = await this.em.findOne(
        Appointment,
        { id },
        { populate: ['patient', 'doctor'] }
      );

      if (!appointment || !appointment.patient || !appointment.doctor) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.doctor.id !== doctor?.id) {
        res.status(403).json({ error: 'Not authorized to complete this appointment' });
        return;
      }

      if (appointment.status !== AppointmentStatus.APPROVED) {
        res.status(400).json({ error: 'Only approved appointments can be marked as completed' });
        return;
      }

      appointment.status = AppointmentStatus.COMPLETED;
      await this.em.flush();

      res.status(200).json({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: (appointment.notes || '') as string,
        patient: {
          id: appointment.patient.id,
          firstName: appointment.patient.firstName,
          lastName: appointment.patient.lastName,
        },
      });
    } catch (error: any) {
      console.error('Failed to complete appointment:', error);
      res.status(500).json({ error: 'Failed to complete appointment' });
    }
  }
}

export default new AppointmentController();