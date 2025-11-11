import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import Appointment, { AppointmentStatus } from "../entities/distributed/appointment";
import OrganizationUser, { OrganizationUserRole } from "../entities/distributed/organization_user";
import AdminProfile from "../entities/distributed/admin_profile";
import PatientProfile from "../entities/distributed/patient_profile";
import DoctorProfile from "../entities/distributed/doctor_profile";
import {
  getApp,
  getOrm,
  createTestUser,
  trackOrganization,
  getSentEmails,
} from "./fixtures";
import jwtService from "../services/jwt.service";
import { getOrgEm } from "../db/organization-db";
import { OrgJWTPayload } from "../config/jwt.config";
import { emailService } from "../services/email.service";

describe("Appointment API", () => {
  let app: ReturnType<typeof getApp>;
  let orm: ReturnType<typeof getOrm>;
  let organizationName: string;
  let adminToken: string;
  let doctorToken: string;
  let patientToken: string;
  let secondPatientToken: string;
  let secondDoctorToken: string;
  let centralAuthToken: string;
  let doctorId: number;
  let patientId: number;
  let secondPatientId: number;
  let secondDoctorId: number;
  let testAppointmentId: number;

  beforeEach(async () => {
    app = getApp();
    orm = getOrm();

    // Create a central user for creating organizations
    const centralUser = await createTestUser(orm, {
      email: "central@test.com",
      name: "Central Admin",
      password: "password123",
    });

    centralAuthToken = jwtService.generateAccessToken({
      userId: centralUser.id,
      email: centralUser.email,
      name: centralUser.name,
      type: 'central'
    });

    // Create organization via API (this creates the database too)
    const orgResponse = await request(app)
      .post("/organizations")
      .set("Authorization", `Bearer ${centralAuthToken}`)
      .send({ name: `Test Hospital Appointment ${Date.now()}` })
      .expect(201);

    organizationName = orgResponse.body.name;
    trackOrganization(organizationName);

    // Create an admin user, doctor, and patients in the organization database
    const orgEm = await getOrgEm(organizationName);
    const hashedPassword = await jwtService.hashPassword("testpass123");

    // Create admin
    const adminProfile = orgEm.create(AdminProfile, {});
    const adminUser = orgEm.create(OrganizationUser, {
      email: "admin@hospital.com",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      adminProfile,
    });

    // Create doctor
    const doctorProfile = orgEm.create(DoctorProfile, {
      specialization: "Cardiology",
      licenseNumber: "MD123456",
    });
    const doctorUser = orgEm.create(OrganizationUser, {
      email: "doctor@hospital.com",
      password: hashedPassword,
      firstName: "Doctor",
      lastName: "Smith",
      doctorProfile,
    });

    // Create second doctor
    const secondDoctorProfile = orgEm.create(DoctorProfile, {
      specialization: "Neurology",
      licenseNumber: "MD789012",
    });
    const secondDoctorUser = orgEm.create(OrganizationUser, {
      email: "doctor2@hospital.com",
      password: hashedPassword,
      firstName: "Doctor",
      lastName: "Jones",
      doctorProfile: secondDoctorProfile,
    });

    // Create patient
    const patientProfile = orgEm.create(PatientProfile, {
      dateOfBirth: new Date("1990-01-15"),
      phoneNumber: "5551234567",
      ipAddress: '127.0.0.1',
    });
    const patientUser = orgEm.create(OrganizationUser, {
      email: "patient@hospital.com",
      password: hashedPassword,
      firstName: "John",
      lastName: "Doe",
      patientProfile,
    });

    // Create second patient
    const secondPatientProfile = orgEm.create(PatientProfile, {
      dateOfBirth: new Date("1985-05-20"),
      phoneNumber: "5559876543",
      ipAddress: '127.0.0.1',
    });
    const secondPatientUser = orgEm.create(OrganizationUser, {
      email: "patient2@hospital.com",
      password: hashedPassword,
      firstName: "Jane",
      lastName: "Smith",
      patientProfile: secondPatientProfile,
    });

    await orgEm.persistAndFlush([
      adminProfile, adminUser,
      doctorProfile, doctorUser,
      secondDoctorProfile, secondDoctorUser,
      patientProfile, patientUser,
      secondPatientProfile, secondPatientUser,
    ]);

    doctorId = doctorUser.id;
    patientId = patientUser.id;
    secondPatientId = secondPatientUser.id;
    secondDoctorId = secondDoctorUser.id;

    // Generate tokens
    const adminPayload: OrgJWTPayload = {
      userId: adminUser.id,
      email: adminUser.email,
      name: `${adminUser.firstName} ${adminUser.lastName}`,
      orgName: organizationName,
      type: 'org'
    };
    adminToken = jwtService.generateAccessToken(adminPayload);

    const doctorPayload: OrgJWTPayload = {
      userId: doctorUser.id,
      email: doctorUser.email,
      name: `${doctorUser.firstName} ${doctorUser.lastName}`,
      orgName: organizationName,
      type: 'org'
    };
    doctorToken = jwtService.generateAccessToken(doctorPayload);

    const secondDoctorPayload: OrgJWTPayload = {
      userId: secondDoctorUser.id,
      email: secondDoctorUser.email,
      name: `${secondDoctorUser.firstName} ${secondDoctorUser.lastName}`,
      orgName: organizationName,
      type: 'org'
    };
    secondDoctorToken = jwtService.generateAccessToken(secondDoctorPayload);

    const patientPayload: OrgJWTPayload = {
      userId: patientUser.id,
      email: patientUser.email,
      name: `${patientUser.firstName} ${patientUser.lastName}`,
      orgName: organizationName,
      type: 'org'
    };
    patientToken = jwtService.generateAccessToken(patientPayload);

    const secondPatientPayload: OrgJWTPayload = {
      userId: secondPatientUser.id,
      email: secondPatientUser.email,
      name: `${secondPatientUser.firstName} ${secondPatientUser.lastName}`,
      orgName: organizationName,
      type: 'org'
    };
    secondPatientToken = jwtService.generateAccessToken(secondPatientPayload);

    // Book a test appointment
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const bookResponse = await request(app)
      .post(`/${organizationName}/appointments`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({
        doctorId,
        appointmentDateTime: futureDate.toISOString(),
        notes: "Test appointment notes",
      })
      .expect(201);

    testAppointmentId = bookResponse.body.id;
    emailService.clearSentEmails();
  });

  describe("POST /:orgName/appointments", () => {
    it("should book a valid appointment and verify database status", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
          notes: "Regular checkup",
        })
        .expect(201);

      expect(response.body, `Expected id in response but got: ${JSON.stringify(response.body)}`).to.have.property("id");
      expect(response.body).to.have.property("status", AppointmentStatus.PENDING);
      expect(response.body).to.have.property("notes", "Regular checkup");
      expect(response.body.doctor).to.have.property("id", doctorId);

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: response.body.id });
      expect(apt, "Appointment should exist in database").to.not.be.null;
      expect(apt!.status).to.equal(AppointmentStatus.PENDING);
      expect(apt!.patient?.id).to.equal(patientId);
      expect(apt!.doctor?.id).to.equal(doctorId);

      // Verify email was sent to doctor
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("doctor@hospital.com");
      expect(sentEmails[0]!.subject).to.include("New Appointment");
    });

    it("should require patient authentication", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-patient roles (doctor)", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(403);

      expect(response.body, `Expected patient access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should validate doctorId as positive integer", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId: -1,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should require future datetime", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: pastDate.toISOString(),
        })
        .expect(400);

      expect(response.body, `Expected validation error for past date but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should reject non-existent doctor", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId: 99999,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(404);

      expect(response.body, `Expected doctor not found error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Doctor not found");
    });

    it("should allow booking multiple appointments", async () => {
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 7);
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 14);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate1.toISOString(),
        })
        .expect(201);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate2.toISOString(),
        })
        .expect(201);

      // Verify count in database
      const em = await getOrgEm(organizationName);
      const count = await em.count(Appointment, { patient: patientId });
      expect(count, "Should have at least 3 appointments (including beforeEach)").to.be.at.least(3);
    });

    it("should handle optional notes field", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(201);

      // Verify notes is null in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: response.body.id });
      expect(apt!.notes).to.be.null;
    });
  });

  describe("GET /:orgName/appointments/me", () => {
    it("should return appointment history with doctor details", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .set("Authorization", `Bearer ${patientToken}`)
      expect(response.status).to.equal(200);

      expect(response.body.appointments, `Expected appointments array in response but got: ${JSON.stringify(response.body)}`).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.be.at.least(1);

      const appointment = response.body.appointments[0];
      expect(appointment).to.have.property("id");
      expect(appointment).to.have.property("appointmentDateTime");
      expect(appointment).to.have.property("status");
      expect(appointment).to.have.property("doctor");
      expect(appointment.doctor).to.have.property("id", doctorId);
      expect(appointment.doctor).to.have.property("firstName", "Doctor");
      expect(appointment.doctor).to.have.property("lastName", "Smith");
      expect(appointment.doctor).to.have.property("specialization", "Cardiology");
    });

    it("should require patient authentication", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-patient roles", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(403);

      expect(response.body, `Expected patient access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should return empty array for patient with no appointments", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .set("Authorization", `Bearer ${secondPatientToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.equal(0);
      expect(response.body.total).to.equal(0);
    });

    it("should order appointments by date descending", async () => {
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 5);
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 15);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate2.toISOString(),
        })
        .expect(201);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate1.toISOString(),
        })
        .expect(201);

      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.be.at.least(3);

      // Verify descending order
      for (let i = 0; i < response.body.appointments.length - 1; i++) {
        const date1 = new Date(response.body.appointments[i].appointmentDateTime);
        const date2 = new Date(response.body.appointments[i + 1].appointmentDateTime);
        expect(date1.getTime()).to.be.at.least(date2.getTime());
      }
    });

    it("should include all appointment statuses", async () => {
      // Approve the test appointment
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      const response = await request(app)
        .get(`/${organizationName}/appointments/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      const statuses = response.body.appointments.map((apt: any) => apt.status);
      expect(statuses).to.include(AppointmentStatus.APPROVED);
    });
  });

  describe("GET /:orgName/appointments/pending", () => {
    it("should return pending appointments with patient details", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.appointments, `Expected appointments array in response but got: ${JSON.stringify(response.body)}`).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.be.at.least(1);

      const appointment = response.body.appointments[0];
      expect(appointment).to.have.property("id", testAppointmentId);
      expect(appointment).to.have.property("status", AppointmentStatus.PENDING);
      expect(appointment).to.have.property("patient");
      expect(appointment.patient).to.have.property("id", patientId);
      expect(appointment.patient).to.have.property("firstName", "John");
      expect(appointment.patient).to.have.property("lastName", "Doe");
      expect(appointment.patient).to.have.property("dateOfBirth");
      expect(appointment.patient).to.have.property("phoneNumber");
    });

    it("should require doctor authentication", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-doctor roles", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body, `Expected doctor access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should return empty array for doctor with no pending appointments", async () => {
      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${secondDoctorToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.equal(0);
      expect(response.body.total).to.equal(0);
    });

    it("should order appointments by date ascending", async () => {
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 5);
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 15);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate2.toISOString(),
        })
        .expect(201);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate1.toISOString(),
        })
        .expect(201);

      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.be.at.least(3);

      // Verify ascending order
      for (let i = 0; i < response.body.appointments.length - 1; i++) {
        const date1 = new Date(response.body.appointments[i].appointmentDateTime);
        const date2 = new Date(response.body.appointments[i + 1].appointmentDateTime);
        expect(date1.getTime()).to.be.at.most(date2.getTime());
      }
    });

    it("should only return pending status appointments", async () => {
      // Approve one appointment
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      // Verify all returned appointments are PENDING
      response.body.appointments.forEach((apt: any) => {
        expect(apt.status).to.equal(AppointmentStatus.PENDING);
      });
    });

    it("should return correct count for multiple pending appointments", async () => {
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 5);
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 10);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate1.toISOString(),
        })
        .expect(201);

      await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate2.toISOString(),
        })
        .expect(201);

      const response = await request(app)
        .get(`/${organizationName}/appointments/pending`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.appointments).to.be.an("array");
      expect(response.body).to.have.property("total");
      expect(response.body).to.have.property("limit");
      expect(response.body).to.have.property("offset");
      expect(response.body.appointments.length).to.equal(3);
      expect(response.body.total).to.equal(3);
    });
  });

  describe("PUT /:orgName/appointments/:id/approve", () => {
    it("should approve pending appointment and update database", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body).to.have.property("id", testAppointmentId);
      expect(response.body).to.have.property("status", AppointmentStatus.APPROVED);
      expect(response.body).to.have.property("patient");
      expect(response.body.patient).to.have.property("id", patientId);

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: testAppointmentId });
      expect(apt!.status).to.equal(AppointmentStatus.APPROVED);

      // Verify email was sent to patient
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("patient@hospital.com");
      expect(sentEmails[0]!.subject).to.include("Approved");
    });

    it("should require doctor authentication", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-doctor roles", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body, `Expected doctor access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should verify ownership - other doctor cannot approve", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${secondDoctorToken}`)
        .expect(403);

      expect(response.body, `Expected authorization error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Not authorized to approve this appointment");
    });

    it("should only approve pending appointments", async () => {
      // First approve it
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      // Try to approve again
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected status validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Only pending appointments can be approved");
    });

    it("should reject invalid appointment ID", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/invalid/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should reject non-existent appointment", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/99999/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(404);

      expect(response.body, `Expected not found error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Appointment not found");
    });

    it("should include patient details in response", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.patient).to.have.property("id", patientId);
      expect(response.body.patient).to.have.property("firstName", "John");
      expect(response.body.patient).to.have.property("lastName", "Doe");
    });
  });

  describe("PUT /:orgName/appointments/:id/decline", () => {
    it("should decline pending appointment and update database", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/decline`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body).to.have.property("id", testAppointmentId);
      expect(response.body).to.have.property("status", AppointmentStatus.DECLINED);
      expect(response.body).to.have.property("patient");

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: testAppointmentId });
      expect(apt!.status).to.equal(AppointmentStatus.DECLINED);

      // Verify email was sent to patient
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("patient@hospital.com");
      expect(sentEmails[0]!.subject).to.include("Declined");
    });

    it("should require doctor authentication", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/decline`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-doctor roles", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/decline`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body, `Expected doctor access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should verify ownership - other doctor cannot decline", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/decline`)
        .set("Authorization", `Bearer ${secondDoctorToken}`)
        .expect(403);

      expect(response.body, `Expected authorization error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Not authorized to decline this appointment");
    });

    it("should only decline pending appointments", async () => {
      // First approve it
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      // Try to decline
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/decline`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected status validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Only pending appointments can be declined");
    });

    it("should reject invalid appointment ID", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/invalid/decline`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should reject non-existent appointment", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/99999/decline`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(404);

      expect(response.body, `Expected not found error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Appointment not found");
    });
  });

  describe("PUT /:orgName/appointments/:id/cancel", () => {
    it("should cancel pending appointment and update database", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body).to.have.property("id", testAppointmentId);
      expect(response.body).to.have.property("status", AppointmentStatus.CANCELLED);
      expect(response.body).to.have.property("message", "Appointment cancelled successfully");

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: testAppointmentId });
      expect(apt!.status).to.equal(AppointmentStatus.CANCELLED);

      // Verify email was sent to doctor
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("doctor@hospital.com");
      expect(sentEmails[0]!.subject).to.include("Cancelled");
    });

    it("should cancel approved appointment", async () => {
      // First approve it
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      // Cancel it
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(response.body).to.have.property("status", AppointmentStatus.CANCELLED);
    });

    it("should require patient authentication", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-patient roles", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(403);

      expect(response.body, `Expected patient access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should verify ownership - other patient cannot cancel", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .set("Authorization", `Bearer ${secondPatientToken}`)
        .expect(403);

      expect(response.body, `Expected authorization error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Not authorized to cancel this appointment");
    });

    it("should reject cancelling completed appointments", async () => {
      // Approve and complete
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      // Try to cancel
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Cannot cancel completed, declined, or already cancelled appointments");
    });

    it("should reject invalid appointment ID", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/invalid/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should reject non-existent appointment", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/99999/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(404);

      expect(response.body, `Expected not found error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Appointment not found");
    });
  });

  describe("PUT /:orgName/appointments/:id/complete", () => {
    beforeEach(async () => {
      // Approve the test appointment so it can be completed
      await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);
      emailService.clearSentEmails();
    });

    it("should complete approved appointment and update database", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body).to.have.property("id", testAppointmentId);
      expect(response.body).to.have.property("status", AppointmentStatus.COMPLETED);
      expect(response.body).to.have.property("patient");

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: testAppointmentId });
      expect(apt!.status).to.equal(AppointmentStatus.COMPLETED);

      // Verify email was sent to patient
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("patient@hospital.com");
      expect(sentEmails[0]!.subject).to.include("Completed");
    });

    it("should require doctor authentication", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .expect(401);

      expect(response.body, `Expected authentication error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should reject non-doctor roles", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body, `Expected doctor access required error but got: ${JSON.stringify(response.body)}`).to.have.property("error");
    });

    it("should verify ownership - other doctor cannot complete", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .set("Authorization", `Bearer ${secondDoctorToken}`)
        .expect(403);

      expect(response.body, `Expected authorization error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Not authorized to complete this appointment");
    });

    it("should only complete approved appointments - reject pending", async () => {
      // Create a new pending appointment
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const bookResponse = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(201);

      // Try to complete without approving
      const response = await request(app)
        .put(`/${organizationName}/appointments/${bookResponse.body.id}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected status validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Only approved appointments can be marked as completed");
    });

    it("should reject invalid appointment ID", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/invalid/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body, `Expected validation error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Validation failed");
    });

    it("should reject non-existent appointment", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/99999/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(404);

      expect(response.body, `Expected not found error but got: ${JSON.stringify(response.body)}`).to.have.property("error", "Appointment not found");
    });

    it("should include patient details in response", async () => {
      const response = await request(app)
        .put(`/${organizationName}/appointments/${testAppointmentId}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.patient).to.have.property("id", patientId);
      expect(response.body.patient).to.have.property("firstName", "John");
      expect(response.body.patient).to.have.property("lastName", "Doe");
    });
  });

  describe("End-to-End Flows", () => {
    it("should support full cycle: book -> approve -> complete", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      // Book
      const bookResponse = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
          notes: "Full cycle test",
        })
        .expect(201);

      const aptId = bookResponse.body.id;
      expect(bookResponse.body.status).to.equal(AppointmentStatus.PENDING);

      // Approve
      const approveResponse = await request(app)
        .put(`/${organizationName}/appointments/${aptId}/approve`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(approveResponse.body.status).to.equal(AppointmentStatus.APPROVED);

      // Complete
      const completeResponse = await request(app)
        .put(`/${organizationName}/appointments/${aptId}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(completeResponse.body.status).to.equal(AppointmentStatus.COMPLETED);

      // Verify final status in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: aptId });
      expect(apt!.status).to.equal(AppointmentStatus.COMPLETED);
    });

    it("should support flow: book -> decline", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      // Book
      const bookResponse = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(201);

      const aptId = bookResponse.body.id;

      // Decline
      const declineResponse = await request(app)
        .put(`/${organizationName}/appointments/${aptId}/decline`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(declineResponse.body.status).to.equal(AppointmentStatus.DECLINED);

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: aptId });
      expect(apt!.status).to.equal(AppointmentStatus.DECLINED);
    });

    it("should support flow: book -> cancel by patient", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      // Book
      const bookResponse = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(201);

      const aptId = bookResponse.body.id;

      // Cancel
      const cancelResponse = await request(app)
        .put(`/${organizationName}/appointments/${aptId}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(cancelResponse.body.status).to.equal(AppointmentStatus.CANCELLED);

      // Verify in database
      const em = await getOrgEm(organizationName);
      const apt = await em.findOne(Appointment, { id: aptId });
      expect(apt!.status).to.equal(AppointmentStatus.CANCELLED);
    });

    it("should reject invalid transitions: complete pending appointment", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      // Book
      const bookResponse = await request(app)
        .post(`/${organizationName}/appointments`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({
          doctorId,
          appointmentDateTime: futureDate.toISOString(),
        })
        .expect(201);

      const aptId = bookResponse.body.id;

      // Try to complete without approving
      const response = await request(app)
        .put(`/${organizationName}/appointments/${aptId}/complete`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(400);

      expect(response.body).to.have.property("error", "Only approved appointments can be marked as completed");
    });
  });
});
