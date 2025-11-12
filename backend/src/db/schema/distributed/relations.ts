import { relations } from "drizzle-orm/relations";
import { doctorProfileTable, organizationUserTable, patientProfileTable, adminProfileTable, appointmentTable } from "./schema";

export const organizationUserRelations = relations(organizationUserTable, ({one, many}) => ({
	doctorProfile: one(doctorProfileTable, {
		fields: [organizationUserTable.doctorProfileId],
		references: [doctorProfileTable.id]
	}),
	patientProfile: one(patientProfileTable, {
		fields: [organizationUserTable.patientProfileId],
		references: [patientProfileTable.id]
	}),
	adminProfile: one(adminProfileTable, {
		fields: [organizationUserTable.adminProfileId],
		references: [adminProfileTable.id]
	}),
	appointments_patientId: many(appointmentTable, {
		relationName: "appointment_patientId_organizationUser_id"
	}),
	appointments_doctorId: many(appointmentTable, {
		relationName: "appointment_doctorId_organizationUser_id"
	}),
}));

export const doctorProfileRelations = relations(doctorProfileTable, ({many}) => ({
	organizationUsers: many(organizationUserTable),
}));

export const patientProfileRelations = relations(patientProfileTable, ({many}) => ({
	organizationUsers: many(organizationUserTable),
}));

export const adminProfileRelations = relations(adminProfileTable, ({many}) => ({
	organizationUsers: many(organizationUserTable),
}));

export const appointmentRelations = relations(appointmentTable, ({one}) => ({
	organizationUser_patientId: one(organizationUserTable, {
		fields: [appointmentTable.patientId],
		references: [organizationUserTable.id],
		relationName: "appointment_patientId_organizationUser_id"
	}),
	organizationUser_doctorId: one(organizationUserTable, {
		fields: [appointmentTable.doctorId],
		references: [organizationUserTable.id],
		relationName: "appointment_doctorId_organizationUser_id"
	}),
}));