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
            specialization: appointment.doctor.doctorProfile?.specialization,
          } : null,
          createdAt: appointment.createdAt,
        }))
      );
    } catch (error: any) {
      console.error('Failed to get appointments:', error);
      res.status(500).json({ error: 'Failed to get appointments' });
    }
  }
}

export default new AppointmentController();