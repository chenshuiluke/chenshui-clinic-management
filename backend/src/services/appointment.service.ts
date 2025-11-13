import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, count, desc, asc, isNotNull } from 'drizzle-orm';
import * as distributedSchema from '../db/schema/distributed/schema';
import * as distributedRelations from '../db/schema/distributed/relations';
import { appointmentTable } from '../db/schema/distributed/schema';
import type { AppointmentStatusType } from '../db/schema/distributed/enums';
import { emailService } from './email.service';
import type { OrganizationUserWithProfile } from '../middleware/auth';

type UserLike = OrganizationUserWithProfile;

const DbSchema = { ...distributedSchema, ...distributedRelations };
type Db = NodePgDatabase<typeof DbSchema>;

class AppointmentService {
  async bookAppointment(db: Db, patient: UserLike, doctorId: number, appointmentDateTime: string, notes?: string) {
    const doctor = await db.query.organizationUserTable.findFirst({
      where: (users, { eq }) => eq(users.id, doctorId),
      with: {
        doctorProfile: true,
      },
    });

    if (!doctor) {
      throw new Error('Doctor not found');
    }

    if (!doctor.doctorProfile) {
      throw new Error('User is not a doctor');
    }

    // ISO 8601 format validation, allowing for date-only or full datetime with optional timezone
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;
    if (!iso8601Regex.test(appointmentDateTime)) {
      throw new Error('Invalid appointment date format. Use ISO 8601 (e.g., 2024-12-01T10:00:00Z)');
    }

    // Normalize date-only strings to UTC midnight
    let parsableDateTime = appointmentDateTime;
    if (parsableDateTime.length === 10) { // YYYY-MM-DD
      parsableDateTime += 'T00:00:00.000Z';
    }

    const parsedDate = new Date(parsableDateTime);

    // Verify the date is valid after parsing
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid appointment date format. Use ISO 8601 (e.g., 2024-12-01T10:00:00Z)');
    }

    // Ensure date is in the future
    if (parsedDate <= new Date()) {
      throw new Error('Appointment date must be in the future');
    }

    const [appointment] = await db.insert(appointmentTable).values({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDateTime: parsedDate,
      status: 'PENDING',
      notes: notes ?? null,
    }).returning();

    if (!appointment) {
      throw new Error('Failed to create appointment');
    }

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

  async getPatientAppointments(db: Db, patient: UserLike, limit?: number, offset?: number) {
    const config: any = {
      where: (appts: any, { eq }: any) => eq(appts.patientId, patient.id),
      with: {
        organizationUser_doctorId: {
          with: {
            doctorProfile: true,
          },
        },
      },
      orderBy: (appts: any, { desc }: any) => desc(appts.appointmentDateTime),
      ...(limit !== undefined && { limit }),
      ...(offset !== undefined && { offset }),
    };
    const appointments = await db.query.appointmentTable.findMany(config) as any;

    const countResult = await db.select({ value: count() })
      .from(appointmentTable)
      .where(eq(appointmentTable.patientId, patient.id));
    const total = Number(countResult[0]?.value || 0);

    return {
      appointments: appointments.map((appointment: any) => ({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: appointment.notes,
        doctor: appointment.organizationUser_doctorId ? {
          id: appointment.organizationUser_doctorId.id,
          firstName: appointment.organizationUser_doctorId.firstName,
          lastName: appointment.organizationUser_doctorId.lastName,
          specialization: appointment.organizationUser_doctorId.doctorProfile?.specialization ?? '',
        } : null,
        createdAt: appointment.createdAt,
      })),
      total,
      limit: limit ?? 10,
      offset: offset ?? 0,
    };
  }

  async getDoctorPendingAppointments(db: Db, doctor: UserLike, limit?: number, offset?: number) {
    const config: any = {
      where: (appts: any, { eq, and, isNotNull }: any) => and(
        eq(appts.doctorId, doctor.id),
        eq(appts.status, 'PENDING'),
        isNotNull(appts.patientId)
      ),
      with: {
        organizationUser_patientId: {
          with: {
            patientProfile: true,
          },
        },
      },
      orderBy: (appts: any, { asc }: any) => asc(appts.appointmentDateTime),
      ...(limit !== undefined && { limit }),
      ...(offset !== undefined && { offset }),
    };
    const appointments = await db.query.appointmentTable.findMany(config) as any;

    const countResult = await db.select({ value: count() })
      .from(appointmentTable)
      .where(and(
        eq(appointmentTable.doctorId, doctor.id),
        eq(appointmentTable.status, 'PENDING'),
        isNotNull(appointmentTable.patientId)
      ));
    const total = Number(countResult[0]?.value || 0);

    return {
      appointments: appointments.map((appointment: any) => ({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: appointment.notes ?? null,
        patient: {
          id: appointment.organizationUser_patientId!.id,
          firstName: appointment.organizationUser_patientId!.firstName,
          lastName: appointment.organizationUser_patientId!.lastName,
          dateOfBirth: appointment.organizationUser_patientId!.patientProfile?.dateOfBirth ?? '',
          phoneNumber: appointment.organizationUser_patientId!.patientProfile?.phoneNumber ?? '',
          allergies: appointment.organizationUser_patientId!.patientProfile?.allergies ?? null,
          chronicConditions: appointment.organizationUser_patientId!.patientProfile?.chronicConditions ?? null,
        },
        createdAt: appointment.createdAt,
      })),
      total,
      limit: limit ?? 10,
      offset: offset ?? 0,
    };
  }

  async getDoctorAppointments(db: Db, doctor: UserLike, limit?: number, offset?: number, status?: AppointmentStatusType) {
    const config: any = {
      where: (appts: any, { eq, and, isNotNull }: any) => {
        const filters = [
          eq(appts.doctorId, doctor.id),
          isNotNull(appts.patientId)
        ];
        if (status !== undefined) {
          filters.push(eq(appts.status, status));
        }
        return and(...filters);
      },
      with: {
        organizationUser_patientId: {
          with: {
            patientProfile: true,
          },
        },
      },
      orderBy: (appts: any, { desc }: any) => desc(appts.appointmentDateTime),
      ...(limit !== undefined && { limit }),
      ...(offset !== undefined && { offset }),
    };
    const appointments = await db.query.appointmentTable.findMany(config) as any;

    const filters = [
      eq(appointmentTable.doctorId, doctor.id),
      isNotNull(appointmentTable.patientId)
    ];
    if (status !== undefined) {
      filters.push(eq(appointmentTable.status, status));
    }
    const countResult = await db.select({ value: count() })
      .from(appointmentTable)
      .where(and(...filters));
    const total = Number(countResult[0]?.value || 0);

    return {
      appointments: appointments.map((appointment: any) => ({
        id: appointment.id,
        appointmentDateTime: appointment.appointmentDateTime,
        status: appointment.status,
        notes: appointment.notes ?? null,
        patient: {
          id: appointment.organizationUser_patientId!.id,
          firstName: appointment.organizationUser_patientId!.firstName,
          lastName: appointment.organizationUser_patientId!.lastName,
          dateOfBirth: appointment.organizationUser_patientId!.patientProfile?.dateOfBirth ?? '',
          phoneNumber: appointment.organizationUser_patientId!.patientProfile?.phoneNumber ?? '',
          allergies: appointment.organizationUser_patientId!.patientProfile?.allergies ?? null,
          chronicConditions: appointment.organizationUser_patientId!.patientProfile?.chronicConditions ?? null,
        },
        createdAt: appointment.createdAt,
      })),
      total,
      limit: limit ?? 10,
      offset: offset ?? 0,
    };
  }

  async approveAppointment(db: Db, appointmentId: number, doctor: UserLike) {
    const appointment = await db.query.appointmentTable.findFirst({
      where: (appts, { eq }) => eq(appts.id, appointmentId),
      with: {
        organizationUser_patientId: {
          with: {
            patientProfile: true,
          },
        },
        organizationUser_doctorId: true,
      },
    });

    if (!appointment || !appointment.organizationUser_patientId || !appointment.organizationUser_doctorId) {
      throw new Error('Appointment not found');
    }

    if (appointment.organizationUser_doctorId.id !== doctor.id) {
      throw new Error('Not authorized to approve this appointment');
    }

    const updated = await db.update(appointmentTable)
      .set({ status: 'APPROVED', updatedAt: new Date() })
      .where(and(
        eq(appointmentTable.id, appointmentId),
        eq(appointmentTable.status, 'PENDING')
      ))
      .returning({ id: appointmentTable.id });

    if (updated.length === 0) {
      throw new Error('Only pending appointments can be approved');
    }

    // Send approval notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentApprovedEmail({
        patientEmail: appointment.organizationUser_patientId.email,
        patientName: `${appointment.organizationUser_patientId.firstName} ${appointment.organizationUser_patientId.lastName}`,
        doctorName: `${appointment.organizationUser_doctorId.firstName} ${appointment.organizationUser_doctorId.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment approved email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: 'APPROVED',
      notes: appointment.notes ?? null,
      patient: {
        id: appointment.organizationUser_patientId.id,
        firstName: appointment.organizationUser_patientId.firstName,
        lastName: appointment.organizationUser_patientId.lastName,
        dateOfBirth: appointment.organizationUser_patientId.patientProfile?.dateOfBirth ?? '',
        phoneNumber: appointment.organizationUser_patientId.patientProfile?.phoneNumber ?? '',
        allergies: appointment.organizationUser_patientId.patientProfile?.allergies ?? null,
        chronicConditions: appointment.organizationUser_patientId.patientProfile?.chronicConditions ?? null,
      },
      createdAt: appointment.createdAt,
    };
  }

  async declineAppointment(db: Db, appointmentId: number, doctor: UserLike) {
    const appointment = await db.query.appointmentTable.findFirst({
      where: (appts, { eq }) => eq(appts.id, appointmentId),
      with: {
        organizationUser_patientId: {
          with: {
            patientProfile: true,
          },
        },
        organizationUser_doctorId: true,
      },
    });

    if (!appointment || !appointment.organizationUser_patientId || !appointment.organizationUser_doctorId) {
      throw new Error('Appointment not found');
    }

    if (appointment.organizationUser_doctorId.id !== doctor.id) {
      throw new Error('Not authorized to decline this appointment');
    }

    const updated = await db.update(appointmentTable)
      .set({ status: 'DECLINED', updatedAt: new Date() })
      .where(and(
        eq(appointmentTable.id, appointmentId),
        eq(appointmentTable.status, 'PENDING')
      ))
      .returning({ id: appointmentTable.id });

    if (updated.length === 0) {
      throw new Error('Only pending appointments can be declined');
    }

    // Send decline notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentDeclinedEmail({
        patientEmail: appointment.organizationUser_patientId.email,
        patientName: `${appointment.organizationUser_patientId.firstName} ${appointment.organizationUser_patientId.lastName}`,
        doctorName: `${appointment.organizationUser_doctorId.firstName} ${appointment.organizationUser_doctorId.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment declined email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: 'DECLINED',
      notes: appointment.notes ?? null,
      patient: {
        id: appointment.organizationUser_patientId.id,
        firstName: appointment.organizationUser_patientId.firstName,
        lastName: appointment.organizationUser_patientId.lastName,
        dateOfBirth: appointment.organizationUser_patientId.patientProfile?.dateOfBirth ?? '',
        phoneNumber: appointment.organizationUser_patientId.patientProfile?.phoneNumber ?? '',
        allergies: appointment.organizationUser_patientId.patientProfile?.allergies ?? null,
        chronicConditions: appointment.organizationUser_patientId.patientProfile?.chronicConditions ?? null,
      },
      createdAt: appointment.createdAt,
    };
  }

  async cancelAppointment(db: Db, appointmentId: number, patient: UserLike) {
    const appointment = await db.query.appointmentTable.findFirst({
      where: (appts, { eq }) => eq(appts.id, appointmentId),
      with: {
        organizationUser_patientId: true,
        organizationUser_doctorId: true,
      },
    });

    if (!appointment || !appointment.organizationUser_patientId) {
      throw new Error('Appointment not found');
    }

    if (appointment.organizationUser_patientId.id !== patient.id) {
      throw new Error('Not authorized to cancel this appointment');
    }

    if (
      appointment.status === 'COMPLETED' ||
      appointment.status === 'DECLINED' ||
      appointment.status === 'CANCELLED'
    ) {
      throw new Error('Cannot cancel completed, declined, or already cancelled appointments');
    }

    await db.update(appointmentTable)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(appointmentTable.id, appointmentId));

    // Send cancellation notification email to doctor (don't block on failure)
    try {
      if (appointment.organizationUser_doctorId) {
        await emailService.sendAppointmentCancelledEmail({
          doctorEmail: appointment.organizationUser_doctorId.email,
          doctorName: `${appointment.organizationUser_doctorId.firstName} ${appointment.organizationUser_doctorId.lastName}`,
          patientName: `${appointment.organizationUser_patientId.firstName} ${appointment.organizationUser_patientId.lastName}`,
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
      status: 'CANCELLED',
      message: 'Appointment cancelled successfully',
    };
  }

  async completeAppointment(db: Db, appointmentId: number, doctor: UserLike) {
    const appointment = await db.query.appointmentTable.findFirst({
      where: (appts, { eq }) => eq(appts.id, appointmentId),
      with: {
        organizationUser_patientId: {
          with: {
            patientProfile: true,
          },
        },
        organizationUser_doctorId: true,
      },
    });

    if (!appointment || !appointment.organizationUser_patientId || !appointment.organizationUser_doctorId) {
      throw new Error('Appointment not found');
    }

    if (appointment.organizationUser_doctorId.id !== doctor.id) {
      throw new Error('Not authorized to complete this appointment');
    }

    const updated = await db.update(appointmentTable)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(and(
        eq(appointmentTable.id, appointmentId),
        eq(appointmentTable.status, 'APPROVED')
      ))
      .returning({ id: appointmentTable.id });

    if (updated.length === 0) {
      throw new Error('Only approved appointments can be marked as completed');
    }

    // Send completion notification email to patient (don't block on failure)
    try {
      await emailService.sendAppointmentCompletedEmail({
        patientEmail: appointment.organizationUser_patientId.email,
        patientName: `${appointment.organizationUser_patientId.firstName} ${appointment.organizationUser_patientId.lastName}`,
        doctorName: `${appointment.organizationUser_doctorId.firstName} ${appointment.organizationUser_doctorId.lastName}`,
        appointmentDateTime: appointment.appointmentDateTime,
      });
    } catch (emailError) {
      console.error('Failed to send appointment completed email:', emailError);
      // Continue even if email fails
    }

    return {
      id: appointment.id,
      appointmentDateTime: appointment.appointmentDateTime,
      status: 'COMPLETED',
      notes: appointment.notes ?? null,
      patient: {
        id: appointment.organizationUser_patientId.id,
        firstName: appointment.organizationUser_patientId.firstName,
        lastName: appointment.organizationUser_patientId.lastName,
        dateOfBirth: appointment.organizationUser_patientId.patientProfile?.dateOfBirth ?? '',
        phoneNumber: appointment.organizationUser_patientId.patientProfile?.phoneNumber ?? '',
        allergies: appointment.organizationUser_patientId.patientProfile?.allergies ?? null,
        chronicConditions: appointment.organizationUser_patientId.patientProfile?.chronicConditions ?? null,
      },
      createdAt: appointment.createdAt,
    };
  }
}

export default new AppointmentService();