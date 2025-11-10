import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
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

describe("Patient API", () => {
  let app: ReturnType<typeof getApp>;
  let orm: ReturnType<typeof getOrm>;
  let organizationName: string;
  let adminToken: string;
  let centralAuthToken: string;

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
    });

    // Create organization via API (this creates the database too)
    const orgResponse = await request(app)
      .post("/organizations")
      .set("Authorization", `Bearer ${centralAuthToken}`)
      .send({ name: `Test Hospital Patient ${Date.now()}` })
      .expect(201);

    organizationName = orgResponse.body.name;
    trackOrganization(organizationName);

    // Create an admin user in the organization database
    const orgEm = await getOrgEm(organizationName);
    const hashedPassword = await jwtService.hashPassword("adminpass123");

    const adminProfile = orgEm.create(AdminProfile, {});
    const adminUser = orgEm.create(OrganizationUser, {
      email: "admin@hospital.com",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      adminProfile,
    });

    await orgEm.persistAndFlush([adminProfile, adminUser]);

    // Generate admin token with orgName field
    const adminPayload: OrgJWTPayload = {
      userId: adminUser.id,
      email: adminUser.email,
      name: `${adminUser.firstName} ${adminUser.lastName}`,
      orgName: organizationName,
      role: OrganizationUserRole.ADMIN,
    };
    adminToken = jwtService.generateAccessToken(adminPayload);
  });

  describe("POST /:orgName/patients/register", () => {
    it("should register a patient with all required and optional fields", async () => {
      const patientData = {
        email: "patient@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
        address: "123 Main St, City, State 12345",
        emergencyContactName: "Jane Doe",
        emergencyContactPhone: "5559876543",
        bloodType: "O+",
        allergies: "Peanuts, Penicillin",
        chronicConditions: "Asthma",
      };

      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      expect(
        response.body,
        `Expected accessToken in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("accessToken");
      expect(
        response.body,
        `Expected refreshToken in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("refreshToken");
      expect(response.body).to.have.property("user");
      expect(response.body.user).to.have.property("id");
      expect(response.body.user).to.have.property("email", patientData.email);
      expect(response.body.user).to.have.property("firstName", patientData.firstName);
      expect(response.body.user).to.have.property("lastName", patientData.lastName);
      expect(response.body.user).to.have.property("role", "patient");
      expect(response.body.user).to.not.have.property(
        "password",
        `Password should not be returned in response but got: ${JSON.stringify(response.body.user)}`,
      );

      // Verify in database
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(patientData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName);
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(savedPatient!.patientProfile!.dateOfBirth).to.be.instanceOf(Date);
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(patientData.phoneNumber);
      expect(savedPatient!.patientProfile!.address).to.equal(patientData.address);
      expect(savedPatient!.patientProfile!.emergencyContactName).to.equal(
        patientData.emergencyContactName,
      );
      expect(savedPatient!.patientProfile!.emergencyContactPhone).to.equal(
        patientData.emergencyContactPhone,
      );
      expect(savedPatient!.patientProfile!.bloodType).to.equal(patientData.bloodType);
      expect(savedPatient!.patientProfile!.allergies).to.equal(patientData.allergies);
      expect(savedPatient!.patientProfile!.chronicConditions).to.equal(
        patientData.chronicConditions,
      );
      expect(
        savedPatient!.patientProfile!.ipAddress,
        `IP address should be set but got: ${savedPatient!.patientProfile!.ipAddress}`,
      ).to.not.be.empty;
      expect(savedPatient!.patientProfile!.ipAddress).to.not.equal("0.0.0.0");

      // Verify password is hashed
      expect(
        await jwtService.comparePassword(
          patientData.password,
          savedPatient!.password,
        ),
        `Password hash verification failed for patient ${patientData.email}`,
      ).to.be.true;

      // Verify tokens work for authentication
      const meResponse = await request(app)
        .get(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${response.body.accessToken}`)
        .expect(200);

      expect(meResponse.body).to.have.property("id", savedPatient!.id);

      // Verify welcome email was sent
      const sentEmails = getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal(patientData.email);
      expect(sentEmails[0]!.subject).to.include("Welcome");
      expect(sentEmails[0]!.htmlBody).to.include(patientData.firstName);
      expect(sentEmails[0]!.htmlBody).to.include(organizationName);
    });

    it("should register a patient with only required fields", async () => {
      const patientData = {
        email: "patient2@example.com",
        password: "password123",
        firstName: "Jane",
        lastName: "Smith",
        dateOfBirth: "1985-05-20",
        phoneNumber: "5559876543",
      };

      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      expect(response.body).to.have.property("accessToken");
      expect(response.body.user).to.have.property("email", patientData.email);

      // Verify optional fields are null/undefined in database
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(
        savedPatient!.patientProfile!.address === null ||
          savedPatient!.patientProfile!.address === undefined,
      ).to.be.true;
      expect(
        savedPatient!.patientProfile!.emergencyContactName === null ||
          savedPatient!.patientProfile!.emergencyContactName === undefined,
      ).to.be.true;
      expect(
        savedPatient!.patientProfile!.bloodType === null ||
          savedPatient!.patientProfile!.bloodType === undefined,
      ).to.be.true;
    });

    it("should track IP address during registration", async () => {
      const patientData = {
        email: "patient3@example.com",
        password: "password123",
        firstName: "Bob",
        lastName: "Johnson",
        dateOfBirth: "1992-03-10",
        phoneNumber: "5551112222",
      };

      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Verify the ipAddress field is set
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(
        savedPatient!.patientProfile!.ipAddress,
        `IP address should be set but got: ${savedPatient!.patientProfile!.ipAddress}`,
      ).to.not.be.empty;
      expect(savedPatient!.patientProfile!.ipAddress).to.not.equal("0.0.0.0");
    });

    it("should not require authentication for registration", async () => {
      const patientData = {
        email: "patient4@example.com",
        password: "password123",
        firstName: "Alice",
        lastName: "Williams",
        dateOfBirth: "1988-07-25",
        phoneNumber: "5553334444",
      };

      // Send request WITHOUT Authorization header
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      expect(response.body).to.have.property("accessToken");
      expect(response.body.user).to.have.property("email", patientData.email);
    });

    it("should reject duplicate email in the same organization", async () => {
      const patientData = {
        email: "duplicate@example.com",
        password: "password123",
        firstName: "First",
        lastName: "Patient",
        dateOfBirth: "1990-01-01",
        phoneNumber: "5551234567",
      };

      // Register first patient
      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Try to register second patient with same email
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          ...patientData,
          firstName: "Second",
        })
        .expect(409);

      expect(response.body).to.have.property(
        "error",
        "User with this email already exists in the organization",
        `Expected duplicate email error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should allow same email in different organizations", async () => {
      const patientData = {
        email: "shared@example.com",
        password: "password123",
        firstName: "Shared",
        lastName: "Patient",
        dateOfBirth: "1990-01-01",
        phoneNumber: "5551234567",
      };

      // Register in first organization
      const response1 = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      expect(response1.body.user).to.have.property("email", patientData.email);

      // Create second organization
      const org2Response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${centralAuthToken}`)
        .send({ name: `Another Hospital ${Date.now()}` })
        .expect(201);

      const org2Name = org2Response.body.name;
      trackOrganization(org2Name);

      // Register in second organization with same email
      const response2 = await request(app)
        .post(`/${org2Name}/patients/register`)
        .send(patientData)
        .expect(201);

      expect(response2.body.user).to.have.property("email", patientData.email);

      // Verify they exist in separate databases with different IDs
      const org1Em = await getOrgEm(organizationName);
      const org1Patient = await org1Em.findOne(OrganizationUser, {
        email: patientData.email,
      });
      expect(org1Patient).to.not.be.null;

      const org2Em = await getOrgEm(org2Name);
      const org2Patient = await org2Em.findOne(OrganizationUser, {
        email: patientData.email,
      });
      expect(org2Patient).to.not.be.null;

      expect(org1Patient!.id).to.not.equal(org2Patient!.id);
    });

    it("should validate email format", async () => {
      const invalidEmail = "not-an-email";
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: invalidEmail,
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for email "${invalidEmail}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate password length", async () => {
      const shortPassword = "short";
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: shortPassword,
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for password length ${shortPassword.length} but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate dateOfBirth format", async () => {
      const invalidDate = "01/15/1990";
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: invalidDate,
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for date format "${invalidDate}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate phoneNumber length", async () => {
      const shortPhone = "123";
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          phoneNumber: shortPhone,
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for phone number length ${shortPhone.length} but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate bloodType enum", async () => {
      const invalidBloodType = "XY+";
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          phoneNumber: "5551234567",
          bloodType: invalidBloodType,
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for blood type "${invalidBloodType}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require firstName field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing firstName but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require lastName field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          dateOfBirth: "1990-01-01",
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing lastName but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require dateOfBirth field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          phoneNumber: "5551234567",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing dateOfBirth but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require phoneNumber field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "patient@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing phoneNumber but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("GET /:orgName/patients/me", () => {
    it("should return patient profile for authenticated patient", async () => {
      const patientData = {
        email: "patient@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
        address: "123 Main St",
        bloodType: "O+",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Get profile
      const meResponse = await request(app)
        .get(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(200);

      expect(meResponse.body).to.have.property("id");
      expect(meResponse.body).to.have.property("email", patientData.email);
      expect(meResponse.body).to.have.property("firstName", patientData.firstName);
      expect(meResponse.body).to.have.property("lastName", patientData.lastName);
      expect(meResponse.body).to.have.property("dateOfBirth");
      expect(meResponse.body).to.have.property("phoneNumber", patientData.phoneNumber);
      expect(meResponse.body).to.have.property("address", patientData.address);
      expect(meResponse.body).to.have.property("bloodType", patientData.bloodType);
    });

    it("should require patient authentication", async () => {
      const response = await request(app)
        .get(`/${organizationName}/patients/me`)
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject non-patient users", async () => {
      // Create a doctor user
      const orgEm = await getOrgEm(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const doctorProfile = orgEm.create(DoctorProfile, {
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      });
      const doctorUser = orgEm.create(OrganizationUser, {
        email: "doctor@hospital.com",
        password: hashedPassword,
        firstName: "Doctor",
        lastName: "User",
        doctorProfile,
      });

      await orgEm.persistAndFlush([doctorProfile, doctorUser]);

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: doctorUser.id,
        email: doctorUser.email,
        name: `${doctorUser.firstName} ${doctorUser.lastName}`,
        orgName: organizationName,
        role: OrganizationUserRole.DOCTOR,
      };
      const doctorToken = jwtService.generateAccessToken(doctorPayload);

      // Try to access patient /me endpoint
      const response = await request(app)
        .get(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(403);

      expect(response.body).to.have.property(
        "error",
        "Patient access required",
        `Expected patient access required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject token without orgName", async () => {
      // Generate token without orgName field
      const tokenWithoutOrg = jwtService.generateAccessToken({
        userId: 1,
        email: "patient@example.com",
        name: "Patient User",
      } as any);

      const response = await request(app)
        .get(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${tokenWithoutOrg}`)
        .expect(401);

      expect(response.body).to.have.property("error");
    });

    it("should reject token with mismatched orgName", async () => {
      // Register a patient first
      const patientData = {
        email: "patient@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Generate token with different orgName
      const mismatchedPayload: OrgJWTPayload = {
        userId: registerResponse.body.user.id,
        email: registerResponse.body.user.email,
        name: `${registerResponse.body.user.firstName} ${registerResponse.body.user.lastName}`,
        orgName: "Different Organization",
        role: OrganizationUserRole.PATIENT,
      };
      const mismatchedToken = jwtService.generateAccessToken(mismatchedPayload);

      const response = await request(app)
        .get(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${mismatchedToken}`)
        .expect(401);

      expect(response.body).to.have.property("error");
    });
  });

  describe("PUT /:orgName/patients/me", () => {
    it("should update patient profile with all fields", async () => {
      const patientData = {
        email: "patient@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Update profile
      const updateData = {
        firstName: "Jane",
        lastName: "Smith",
        dateOfBirth: "1985-05-20",
        phoneNumber: "5559876543",
        address: "456 Oak Ave",
        emergencyContactName: "John Smith",
        emergencyContactPhone: "5551112222",
        bloodType: "A+",
        allergies: "Shellfish",
        chronicConditions: "Diabetes",
      };

      const updateResponse = await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send(updateData)
        .expect(200);

      expect(updateResponse.body).to.have.property("firstName", updateData.firstName);
      expect(updateResponse.body).to.have.property("lastName", updateData.lastName);
      expect(updateResponse.body).to.have.property("phoneNumber", updateData.phoneNumber);
      expect(updateResponse.body).to.have.property("address", updateData.address);
      expect(updateResponse.body).to.have.property("bloodType", updateData.bloodType);

      // Verify all fields updated in database
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(updateData.firstName);
      expect(savedPatient!.lastName).to.equal(updateData.lastName);
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(updateData.phoneNumber);
      expect(savedPatient!.patientProfile!.address).to.equal(updateData.address);
      expect(savedPatient!.patientProfile!.emergencyContactName).to.equal(
        updateData.emergencyContactName,
      );
      expect(savedPatient!.patientProfile!.emergencyContactPhone).to.equal(
        updateData.emergencyContactPhone,
      );
      expect(savedPatient!.patientProfile!.bloodType).to.equal(updateData.bloodType);
      expect(savedPatient!.patientProfile!.allergies).to.equal(updateData.allergies);
      expect(savedPatient!.patientProfile!.chronicConditions).to.equal(
        updateData.chronicConditions,
      );
    });

    it("should update patient profile with partial fields", async () => {
      const patientData = {
        email: "patient2@example.com",
        password: "password123",
        firstName: "Original",
        lastName: "Name",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
        address: "123 Main St",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Update only firstName and phoneNumber
      const updateData = {
        firstName: "Updated",
        phoneNumber: "5559999999",
      };

      await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send(updateData)
        .expect(200);

      // Verify only those fields changed, others remain the same
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(updateData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName); // Unchanged
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(updateData.phoneNumber);
      expect(savedPatient!.patientProfile!.address).to.equal(patientData.address); // Unchanged
    });

    it("should track IP address during profile update", async () => {
      const patientData = {
        email: "patient3@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Update profile
      await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ firstName: "Jane" })
        .expect(200);

      // Verify ipAddress is set
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(
        savedPatient!.patientProfile!.ipAddress,
        `IP address should be set but got: ${savedPatient!.patientProfile!.ipAddress}`,
      ).to.not.be.empty;
    });

    it("should require patient authentication", async () => {
      const response = await request(app)
        .put(`/${organizationName}/patients/me`)
        .send({ firstName: "Updated" })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject non-patient users", async () => {
      // Create a doctor user
      const orgEm = await getOrgEm(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const doctorProfile = orgEm.create(DoctorProfile, {
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      });
      const doctorUser = orgEm.create(OrganizationUser, {
        email: "doctor@hospital.com",
        password: hashedPassword,
        firstName: "Doctor",
        lastName: "User",
        doctorProfile,
      });

      await orgEm.persistAndFlush([doctorProfile, doctorUser]);

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: doctorUser.id,
        email: doctorUser.email,
        name: `${doctorUser.firstName} ${doctorUser.lastName}`,
        orgName: organizationName,
        role: OrganizationUserRole.DOCTOR,
      };
      const doctorToken = jwtService.generateAccessToken(doctorPayload);

      // Try to update patient profile with doctor token
      const response = await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ firstName: "Updated" })
        .expect(403);

      expect(response.body).to.have.property(
        "error",
        "Patient access required",
        `Expected patient access required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate dateOfBirth format on update", async () => {
      const patientData = {
        email: "patient4@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Try to update with invalid date format
      const invalidDate = "01/15/1990";
      const response = await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ dateOfBirth: invalidDate })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for date format "${invalidDate}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate bloodType enum on update", async () => {
      const patientData = {
        email: "patient5@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Try to update with invalid blood type
      const invalidBloodType = "XY+";
      const response = await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ bloodType: invalidBloodType })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for blood type "${invalidBloodType}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should not allow email update", async () => {
      const patientData = {
        email: "patient6@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;
      const originalEmail = registerResponse.body.user.email;

      // Try to update email
      await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ email: "newemail@example.com", firstName: "Updated" })
        .expect(200);

      // Verify email hasn't changed
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { id: registerResponse.body.user.id },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.email).to.equal(originalEmail);
      expect(savedPatient!.firstName).to.equal("Updated"); // Other updates should work
    });

    it("should not allow password update", async () => {
      const patientData = {
        email: "patient7@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      // Register patient
      const registerResponse = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientToken = registerResponse.body.accessToken;

      // Get original password hash
      const orgEm = await getOrgEm(organizationName);
      const originalPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
      );
      const originalPasswordHash = originalPatient!.password;

      // Try to update password
      await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ password: "newpassword456", firstName: "Updated" })
        .expect(200);

      // Verify password hasn't changed
      await orgEm.refresh(originalPatient!);
      expect(originalPatient!.password).to.equal(originalPasswordHash);
      expect(originalPatient!.firstName).to.equal("Updated"); // Other updates should work
    });
  });

  describe("Patient Data Integrity", () => {
    it("should store all patient profile fields correctly", async () => {
      const patientData = {
        email: "complete@example.com",
        password: "password123",
        firstName: "Complete",
        lastName: "Patient",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
        address: "123 Main St, City, State 12345",
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "5559876543",
        bloodType: "AB+",
        allergies: "Peanuts, Latex",
        chronicConditions: "Hypertension",
      };

      const response = await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      const patientId = response.body.user.id;

      // Fetch from database and verify all fields
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { id: patientId },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.email).to.equal(patientData.email);
      expect(savedPatient!.firstName).to.equal(patientData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName);
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(patientData.phoneNumber);
      expect(savedPatient!.patientProfile!.address).to.equal(patientData.address);
      expect(savedPatient!.patientProfile!.emergencyContactName).to.equal(
        patientData.emergencyContactName,
      );
      expect(savedPatient!.patientProfile!.emergencyContactPhone).to.equal(
        patientData.emergencyContactPhone,
      );
      expect(savedPatient!.patientProfile!.bloodType).to.equal(patientData.bloodType);
      expect(savedPatient!.patientProfile!.allergies).to.equal(patientData.allergies);
      expect(savedPatient!.patientProfile!.chronicConditions).to.equal(
        patientData.chronicConditions,
      );
    });

    it("should ensure only one role per user", async () => {
      const patientData = {
        email: "singlerole@example.com",
        password: "password123",
        firstName: "Single",
        lastName: "Role",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Verify in database that user has only patientProfile set
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile", "adminProfile", "doctorProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.patientProfile).to.not.be.null;
      expect(savedPatient!.adminProfile).to.be.null;
      expect(savedPatient!.doctorProfile).to.be.null;
    });

    it("should parse dateOfBirth as Date object", async () => {
      const patientData = {
        email: "datetest@example.com",
        password: "password123",
        firstName: "Date",
        lastName: "Test",
        dateOfBirth: "1990-01-15",
        phoneNumber: "5551234567",
      };

      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Verify dateOfBirth is a Date object
      const orgEm = await getOrgEm(organizationName);
      const savedPatient = await orgEm.findOne(
        OrganizationUser,
        { email: patientData.email },
        { populate: ["patientProfile"] },
      );

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(savedPatient!.patientProfile!.dateOfBirth).to.be.instanceOf(Date);
    });

    it("should handle various blood types", async () => {
      const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

      for (let i = 0; i < bloodTypes.length; i++) {
        const patientData = {
          email: `bloodtype${i}@example.com`,
          password: "password123",
          firstName: "Blood",
          lastName: `Type${i}`,
          dateOfBirth: "1990-01-15",
          phoneNumber: `555${i}${i}${i}${i}${i}${i}${i}`,
          bloodType: bloodTypes[i],
        };

        const response = await request(app)
          .post(`/${organizationName}/patients/register`)
          .send(patientData)
          .expect(201);

        // Verify blood type is stored correctly
        const orgEm = await getOrgEm(organizationName);
        const savedPatient = await orgEm.findOne(
          OrganizationUser,
          { email: patientData.email },
          { populate: ["patientProfile"] },
        );

        expect(savedPatient).to.not.be.null;
        expect(savedPatient!.patientProfile!.bloodType).to.equal(bloodTypes[i]);
      }
    });
  });
});
