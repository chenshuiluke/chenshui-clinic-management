import { EntityManager } from '@mikro-orm/core';
import Appointment, { AppointmentStatus } from '../entities/distributed/appointment';
import OrganizationUser from '../entities/distributed/organization_user';
import { emailService } from './email.service';

class AppointmentService {
  async bookAppointment(em: EntityManager, patient: OrganizationUser, doctorId: number, appointmentDateTime: string, notes?: string) {
    const doctor = await em.findOne(OrganizationUser, { id: doctorId }, {
      populate: ['doctorProfile'],
    });

    if (!doctor) {
      throw new Error('Doctor not found');
    }

    if (!doctor.doctorProfile) {
      throw new Error('User is not a doctor');
    }

    // Validate date format (ISO 8601)
    const parsedDate = new Date(appointmentDateTime);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid appointment date format');
    }

    // Ensure date is in the future
    if (parsedDate <= new Date()) {
      throw new Error('Appointment date must be in the future');
    }

    const appointment = em.create(Appointment, {
      patient,
      doctor,
      appointmentDateTime: parsedDate,
      status: AppointmentStatus.PENDING,
      notes: notes ?? null,
    });

    await em.persistAndFlush(appointment);

    // Send appointment notification email to doctor (don't block on failure)
    try {
      await emailService.sendAppointmentBookedEmail({
        doctorEmail: doctor.email,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        patientName: `${patient.firstName} ${patient.lastName}`,
        appointmentDateTime: parsedDate,
        notes: notes ?? '',
      });
    } catch (emailError) {
      console.error('Failed to send appointment booked email:', emailError);
      // Continue even if email fails
    }

    return {
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
    };
  }

  async getPatientAppointments(em: EntityManager, patient: OrganizationUser, limit?: number, offset?: number) {
    const findOptions: any = {
      populate: ['doctor', 'doctor.doctorProfile'],
      orderBy: { appointmentDateTime: 'DESC' },
    };

    if (limit !== undefined) {
      findOptions.limit = limit;
    }

    if (offset !== undefined) {
      findOptions.offset = offset;
    }

    const appointments = await em.find(
      Appointment,
      { patient },
      findOptions
    );

    const total = await em.count(Appointment, { patient });

    return {
      appointments: appointments.map((appointment) => ({
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
      })),
      total,
      limit,
      offset,
    };
  }

  async getDoctorPendingAppointments(em: EntityManager, doctor: OrganizationUser, limit?: number, offset?: number) {
    const findOptions: any = {
      populate: ['patient', 'patient.patientProfile'],
      orderBy: { appointmentDateTime: 'ASC' },
    };

    if (limit !== undefined) {
      findOptions.limit = limit;
    }

    if (offset !== undefined) {
      findOptions.offset = offset;
    }

    const appointments = await em.find(
      Appointment,
      { doctor, status: AppointmentStatus.PENDING },
      findOptions
    );

    const total = await em.count(Appointment, { doctor, status: AppointmentStatus.PENDING });

    const validAppointments = appointments.filter(apt => apt.patient !== null);

    return {
      appointments: validAppointments.map((appointment) => ({
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
      })),
      total,
      limit,
      offset,
    };
  }

  async approveAppointment(em: EntityManager, appointmentId: number, doctor: OrganizationUser) {
    const appointment = await em.findOne(
      Appointment,
      { id: appointmentId },
      { populate: ['patient', 'doctor'] }
    );

    if (!appointment || !appointment.patient || !appointment.doctor) {
      throw new Error('Appointment not found');
    }

    if (appointment.doctor.id !== doctor.id) {
      throw new Error('Not authorized to approve this appointment');
    }

    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new Error('Only pending appointments can be approved');
    }

    appointment.status = AppointmentStatus.APPROVED;
    await em.flush();

    // Send approval notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentApprovedEmail({
        patientEmail: appointment.patient.email,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment approved email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: appointment.status,
      notes: (appointment.notes || '') as string,
      patient: {
        id: appointment.patient.id,
        firstName: appointment.patient.firstName,
        lastName: appointment.patient.lastName,
      },
    };
  }

  async declineAppointment(em: EntityManager, appointmentId: number, doctor: OrganizationUser) {
    const appointment = await em.findOne(
      Appointment,
      { id: appointmentId },
      { populate: ['patient', 'doctor'] }
    );

    if (!appointment || !appointment.patient || !appointment.doctor) {
      throw new Error('Appointment not found');
    }

    if (appointment.doctor.id !== doctor.id) {
      throw new Error('Not authorized to decline this appointment');
    }

    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new Error('Only pending appointments can be declined');
    }

    appointment.status = AppointmentStatus.DECLINED;
    await em.flush();

    // Send decline notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentDeclinedEmail({
        patientEmail: appointment.patient.email,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment declined email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: appointment.status,
      notes: (appointment.notes || '') as string,
      patient: {
        id: appointment.patient.id,
        firstName: appointment.patient.firstName,
        lastName: appointment.patient.lastName,
      },
    };
  }

  async cancelAppointment(em: EntityManager, appointmentId: number, patient: OrganizationUser) {
    const appointment = await em.findOne(
      Appointment,
      { id: appointmentId },
      { populate: ['patient', 'doctor'] }
    );

    if (!appointment || !appointment.patient) {
      throw new Error('Appointment not found');
    }

    if (appointment.patient.id !== patient.id) {
      throw new Error('Not authorized to cancel this appointment');
    }

    if (
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.DECLINED ||
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new Error('Cannot cancel completed, declined, or already cancelled appointments');
    }

    appointment.status = AppointmentStatus.CANCELLED;
    await em.flush();

    // Send cancellation notification email to doctor (don't block on failure)
    try {
      if (appointment.doctor) {
        await emailService.sendAppointmentCancelledEmail({
          doctorEmail: appointment.doctor.email,
          doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
          patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          appointmentDateTime: appointment.appointmentDateTime,
        });
      }
    } catch (emailError) {
      console.error('Failed to send appointment cancelled email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: appointment.status,
      message: 'Appointment cancelled successfully',
    };
  }

  async completeAppointment(em: EntityManager, appointmentId: number, doctor: OrganizationUser) {
    const appointment = await em.findOne(
      Appointment,
      { id: appointmentId },
      { populate: ['patient', 'doctor'] }
    );

    if (!appointment || !appointment.patient || !appointment.doctor) {
      throw new Error('Appointment not found');
    }

    if (appointment.doctor.id !== doctor.id) {
      throw new Error('Not authorized to complete this appointment');
    }

    if (appointment.status !== AppointmentStatus.APPROVED) {
      throw new Error('Only approved appointments can be marked as completed');
    }

    appointment.status = AppointmentStatus.COMPLETED;
    await em.flush();

    // Send completion notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentCompletedEmail({
        patientEmail: appointment.patient.email,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment completed email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: appointment.status,
      notes: (appointment.notes || '') as string,
      patient: {
        id: appointment.patient.id,
        firstName: appointment.patient.firstName,
        lastName: appointment.patient.lastName,
      },
    };
  }
}

export default new AppointmentService();