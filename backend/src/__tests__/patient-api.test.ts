import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  organizationUserTable,
  adminProfileTable,
  patientProfileTable,
  doctorProfileTable,
} from "../db/schema/distributed/schema";
import {
  OrganizationUser,
  AdminProfile,
  PatientProfile,
  DoctorProfile,
} from "../db/schema/distributed/types";
import { OrganizationUserRole } from "../db/schema/distributed/enums";
import { getOrgDb } from "../db/drizzle-organization-db";
import {
  getApp,
  createTestUser,
  trackOrganization,
  getSentEmails,
  getDb,
} from "./fixtures";
import jwtService from "../services/jwt.service";
import { OrgJWTPayload } from "../config/jwt.config";

describe("Patient API", () => {
  let app: ReturnType<typeof getApp>;
  let db: any;
  let organizationName: string;
  let adminToken: string;
  let centralAuthToken: string;

  beforeEach(async () => {
    app = getApp();
    db = getDb();

    // Create a central user for creating organizations
    const centralUser = await createTestUser(db, {
      email: "central@test.com",
      name: "Central Admin",
      password: "password123",
    });

    centralAuthToken = jwtService.generateAccessToken({
      userId: centralUser.id,
      email: centralUser.email,
      name: centralUser.name,
      type: "central",
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
    const orgDb = await getOrgDb(organizationName);
    const hashedPassword = await jwtService.hashPassword("adminpass123");

    const result = await orgDb.transaction(async (tx) => {
      const [adminProfile] = await tx.insert(adminProfileTable).values({}).returning();
      const [adminUser] = await tx
        .insert(organizationUserTable)
        .values({
          email: "admin@hospital.com",
          password: hashedPassword,
          firstName: "Admin",
          lastName: "User",
          adminProfileId: adminProfile!.id,
        })
        .returning();
      return { adminProfile, adminUser };
    });

    const { adminUser } = result;

    // Generate admin token with orgName field
    const adminPayload: OrgJWTPayload = {
      userId: adminUser!.id,
      email: adminUser!.email,
      name: `${adminUser!.firstName} ${adminUser!.lastName}`,
      orgName: organizationName,
      type: "org",
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
      expect(response.body.user).to.have.property(
        "firstName",
        patientData.firstName,
      );
      expect(response.body.user).to.have.property("lastName", patientData.lastName);
      expect(response.body.user).to.have.property("role", "patient");
      expect(response.body.user).to.not.have.property(
        "password",
        `Password should not be returned in response but got: ${JSON.stringify(response.body.user)}`,
      );

      // Verify in database
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(patientData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName);
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(savedPatient!.patientProfile!.dateOfBirth).to.be.instanceOf(Date);
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(
        patientData.phoneNumber,
      );
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

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
      const org1Db = await getOrgDb(organizationName);
      const org1Patient = await org1Db.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
      });
      expect(org1Patient).to.not.be.null;

      const org2Db = await getOrgDb(org2Name);
      const org2Patient = await org2Db.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
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
      expect(meResponse.body).to.have.property(
        "phoneNumber",
        patientData.phoneNumber,
      );
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
      const orgDb = await getOrgDb(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const result = await orgDb.transaction(async (tx) => {
        const [doctorProfile] = await tx
          .insert(doctorProfileTable)
          .values({
            specialization: "Cardiology",
            licenseNumber: "MD123456",
          })
          .returning();
        const [doctorUser] = await tx
          .insert(organizationUserTable)
          .values({
            email: "doctor@hospital.com",
            password: hashedPassword,
            firstName: "Doctor",
            lastName: "User",
            doctorProfileId: doctorProfile!.id,
          })
          .returning();
        return { doctorUser };
      });

      const { doctorUser } = result;

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: doctorUser!.id,
        email: doctorUser!.email,
        name: `${doctorUser!.firstName} ${doctorUser!.lastName}`,
        orgName: organizationName,
        type: "org",
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
        type: "org",
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

      expect(updateResponse.body).to.have.property(
        "firstName",
        updateData.firstName,
      );
      expect(updateResponse.body).to.have.property("lastName", updateData.lastName);
      expect(updateResponse.body).to.have.property(
        "phoneNumber",
        updateData.phoneNumber,
      );
      expect(updateResponse.body).to.have.property("address", updateData.address);
      expect(updateResponse.body).to.have.property("bloodType", updateData.bloodType);

      // Verify all fields updated in database
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(updateData.firstName);
      expect(savedPatient!.lastName).to.equal(updateData.lastName);
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(
        updateData.phoneNumber,
      );
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.firstName).to.equal(updateData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName); // Unchanged
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(
        updateData.phoneNumber,
      );
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

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
      const orgDb = await getOrgDb(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const result = await orgDb.transaction(async (tx) => {
        const [doctorProfile] = await tx
          .insert(doctorProfileTable)
          .values({
            specialization: "Cardiology",
            licenseNumber: "MD123456",
          })
          .returning();
        const [doctorUser] = await tx
          .insert(organizationUserTable)
          .values({
            email: "doctor@hospital.com",
            password: hashedPassword,
            firstName: "Doctor",
            lastName: "User",
            doctorProfileId: doctorProfile!.id,
          })
          .returning();
        return { doctorUser };
      });

      const { doctorUser } = result;

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: doctorUser!.id,
        email: doctorUser!.email,
        name: `${doctorUser!.firstName} ${doctorUser!.lastName}`,
        orgName: organizationName,
        type: "org",
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.id, registerResponse.body.user.id),
      });

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
      const orgDb = await getOrgDb(organizationName);
      const originalPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
      });
      const originalPasswordHash = originalPatient!.password;

      // Try to update password
      await request(app)
        .put(`/${organizationName}/patients/me`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ password: "newpassword456", firstName: "Updated" })
        .expect(200);

      // Verify password hasn't changed
      const updatedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
      });
      expect(updatedPatient!.password).to.equal(originalPasswordHash);
      expect(updatedPatient!.firstName).to.equal("Updated"); // Other updates should work
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.id, patientId),
        with: {
          patientProfile: true,
        },
      });

      expect(savedPatient).to.not.be.null;
      expect(savedPatient!.email).to.equal(patientData.email);
      expect(savedPatient!.firstName).to.equal(patientData.firstName);
      expect(savedPatient!.lastName).to.equal(patientData.lastName);
      expect(savedPatient!.patientProfile).to.not.be.undefined;
      expect(savedPatient!.patientProfile!.phoneNumber).to.equal(
        patientData.phoneNumber,
      );
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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
          adminProfile: true,
          doctorProfile: true,
        },
      });

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
      const orgDb = await getOrgDb(organizationName);
      const savedPatient = await orgDb.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, patientData.email),
        with: {
          patientProfile: true,
        },
      });

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
        const orgDb = await getOrgDb(organizationName);
        const savedPatient = await orgDb.query.organizationUserTable.findFirst({
          where: (users, { eq }) => eq(users.email, patientData.email),
          with: {
            patientProfile: true,
          },
        });

        expect(savedPatient).to.not.be.null;
        expect(savedPatient!.patientProfile!.bloodType).to.equal(bloodTypes[i]);
      }
    });
  });

  describe("GET /:orgName/patients", () => {
    it("should return all patients for admin user", async () => {
      // Register 3 patients
      const patients = [
        {
          email: "patient1@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5551111111",
          bloodType: "A+",
          allergies: "Peanuts",
        },
        {
          email: "patient2@example.com",
          password: "password123",
          firstName: "Jane",
          lastName: "Smith",
          dateOfBirth: "1985-05-20",
          phoneNumber: "5552222222",
          address: "456 Oak Ave",
        },
        {
          email: "patient3@example.com",
          password: "password123",
          firstName: "Bob",
          lastName: "Johnson",
          dateOfBirth: "1992-03-10",
          phoneNumber: "5553333333",
          chronicConditions: "Diabetes",
        },
      ];

      for (const patient of patients) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send(patient)
          .expect(201);
      }

      // Get all patients with admin token
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).to.have.property("patients");
      expect(response.body.patients).to.be.an("array");
      expect(response.body.patients).to.have.lengthOf(3);
      expect(response.body).to.have.property("total", 3);

      // Verify each patient has the correct fields
      response.body.patients.forEach((patient: any) => {
        expect(patient).to.have.property("id");
        expect(patient).to.have.property("email");
        expect(patient).to.have.property("firstName");
        expect(patient).to.have.property("lastName");
        expect(patient).to.have.property("role", "patient");
        expect(patient).to.have.property("dateOfBirth");
        expect(patient).to.have.property("phoneNumber");
        expect(patient).to.not.have.property("password");
      });

      // Verify specific patient data
      const patient1 = response.body.patients.find((p: any) => p.email === "patient1@example.com");
      expect(patient1).to.exist;
      expect(patient1.bloodType).to.equal("A+");
      expect(patient1.allergies).to.equal("Peanuts");
    });

    it("should return all patients for doctor user", async () => {
      // Create a doctor user
      const orgDb = await getOrgDb(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const result = await orgDb.transaction(async (tx) => {
        const [doctorProfile] = await tx
          .insert(doctorProfileTable)
          .values({
            specialization: "Cardiology",
            licenseNumber: "MD123456",
          })
          .returning();
        const [doctorUser] = await tx
          .insert(organizationUserTable)
          .values({
            email: "doctor@hospital.com",
            password: hashedPassword,
            firstName: "Doctor",
            lastName: "User",
            doctorProfileId: doctorProfile!.id,
          })
          .returning();
        return { doctorUser };
      });

      const { doctorUser } = result;

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: doctorUser!.id,
        email: doctorUser!.email,
        name: `${doctorUser!.firstName} ${doctorUser!.lastName}`,
        orgName: organizationName,
        type: "org",
      };
      const doctorToken = jwtService.generateAccessToken(doctorPayload);

      // Register 2 patients
      const patients = [
        {
          email: "patient1@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5551111111",
        },
        {
          email: "patient2@example.com",
          password: "password123",
          firstName: "Jane",
          lastName: "Smith",
          dateOfBirth: "1985-05-20",
          phoneNumber: "5552222222",
        },
      ];

      for (const patient of patients) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send(patient)
          .expect(201);
      }

      // Get all patients with doctor token
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body).to.have.property("patients");
      expect(response.body.patients).to.be.an("array");
      expect(response.body.patients).to.have.lengthOf(2);
    });

    it("should reject patient users from accessing patient list", async () => {
      // Register a patient
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

      const patientToken = registerResponse.body.accessToken;

      // Try to access patient list with patient token
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${patientToken}`)
        .expect(403);

      expect(response.body).to.have.property("error", "Admin or Doctor access required");
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .expect(401);

      expect(response.body).to.have.property("error", "Authentication token required");
    });

    it("should return empty array when no patients exist", async () => {
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).to.have.property("patients");
      expect(response.body.patients).to.be.an("array");
      expect(response.body.patients).to.have.lengthOf(0);
      expect(response.body).to.have.property("total", 0);
    });

    it("should include all patient profile fields", async () => {
      // Register a patient with all fields
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

      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send(patientData)
        .expect(201);

      // Get all patients
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.patients).to.have.lengthOf(1);
      const patient = response.body.patients[0];

      expect(patient.id).to.exist;
      expect(patient.email).to.equal(patientData.email);
      expect(patient.firstName).to.equal(patientData.firstName);
      expect(patient.lastName).to.equal(patientData.lastName);
      expect(patient.role).to.equal("patient");
      expect(patient.dateOfBirth).to.exist;
      expect(patient.phoneNumber).to.equal(patientData.phoneNumber);
      expect(patient.address).to.equal(patientData.address);
      expect(patient.emergencyContactName).to.equal(patientData.emergencyContactName);
      expect(patient.emergencyContactPhone).to.equal(patientData.emergencyContactPhone);
      expect(patient.bloodType).to.equal(patientData.bloodType);
      expect(patient.allergies).to.equal(patientData.allergies);
      expect(patient.chronicConditions).to.equal(patientData.chronicConditions);
    });

    it("should support pagination", async () => {
      // Register 15 patients
      for (let i = 1; i <= 15; i++) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send({
            email: `patient${i}@example.com`,
            password: "password123",
            firstName: `Patient${i}`,
            lastName: "Test",
            dateOfBirth: "1990-01-15",
            phoneNumber: `555${i.toString().padStart(7, '0')}`,
          })
          .expect(201);
      }

      // Get first page with 10 items
      const page1Response = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 10, offset: 0 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(page1Response.body).to.have.property("patients");
      expect(page1Response.body).to.have.property("total", 15);
      expect(page1Response.body).to.have.property("limit", 10);
      expect(page1Response.body).to.have.property("offset", 0);
      expect(page1Response.body.patients).to.have.lengthOf(10);

      // Get second page with 10 items
      const page2Response = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 10, offset: 10 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(page2Response.body.patients).to.have.lengthOf(5);
      expect(page2Response.body).to.have.property("total", 15);
    });

    it("should support search by name", async () => {
      // Register patients with different names
      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "john.doe@example.com",
          password: "password123",
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5551111111",
        })
        .expect(201);

      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "jane.smith@example.com",
          password: "password123",
          firstName: "Jane",
          lastName: "Smith",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5552222222",
        })
        .expect(201);

      // Search by first name
      const searchResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ q: "john" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(searchResponse.body.patients).to.have.lengthOf(1);
      expect(searchResponse.body.patients[0].firstName).to.equal("John");
    });

    it("should support search by email", async () => {
      // Register patients
      await request(app)
        .post(`/${organizationName}/patients/register`)
        .send({
          email: "test@example.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5551111111",
        })
        .expect(201);

      // Search by email
      const searchResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ q: "test@example" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(searchResponse.body.patients).to.have.lengthOf(1);
      expect(searchResponse.body.patients[0].email).to.equal("test@example.com");
    });







    it("should isolate patients between organizations", async () => {
      // Register patients in first organization
      const org1Patients = [
        {
          email: "org1patient1@example.com",
          password: "password123",
          firstName: "Org1",
          lastName: "Patient1",
          dateOfBirth: "1990-01-15",
          phoneNumber: "5551111111",
        },
        {
          email: "org1patient2@example.com",
          password: "password123",
          firstName: "Org1",
          lastName: "Patient2",
          dateOfBirth: "1985-05-20",
          phoneNumber: "5552222222",
        },
      ];

      for (const patient of org1Patients) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send(patient)
          .expect(201);
      }

      // Create second organization
      const org2Response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${centralAuthToken}`)
        .send({ name: `Test Hospital 2 ${Date.now()}` })
        .expect(201);

      const org2Name = org2Response.body.name;
      trackOrganization(org2Name);

      // Create admin for second organization
      const org2Db = await getOrgDb(org2Name);
      const hashedPassword = await jwtService.hashPassword("adminpass123");

      const org2Result = await org2Db.transaction(async (tx) => {
        const [adminProfile] = await tx.insert(adminProfileTable).values({}).returning();
        const [adminUser] = await tx
          .insert(organizationUserTable)
          .values({
            email: "admin@hospital2.com",
            password: hashedPassword,
            firstName: "Admin",
            lastName: "User2",
            adminProfileId: adminProfile!.id,
          })
          .returning();
        return { adminUser };
      });

      const { adminUser: org2AdminUser } = org2Result;

      const org2AdminPayload: OrgJWTPayload = {
        userId: org2AdminUser!.id,
        email: org2AdminUser!.email,
        name: `${org2AdminUser!.firstName} ${org2AdminUser!.lastName}`,
        orgName: org2Name,
        type: "org",
      };
      const org2AdminToken = jwtService.generateAccessToken(org2AdminPayload);

      // Register patients in second organization
      const org2Patients = [
        {
          email: "org2patient1@example.com",
          password: "password123",
          firstName: "Org2",
          lastName: "Patient1",
          dateOfBirth: "1992-03-10",
          phoneNumber: "5553333333",
        },
      ];

      for (const patient of org2Patients) {
        await request(app)
          .post(`/${org2Name}/patients/register`)
          .send(patient)
          .expect(201);
      }

      // Get patients from first organization
      const org1Response = await request(app)
        .get(`/${organizationName}/patients`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(org1Response.body.patients).to.have.lengthOf(2);
      org1Response.body.patients.forEach((patient: any) => {
        expect(patient.email).to.match(/org1patient/);
      });

      // Get patients from second organization
      const org2PatientsResponse = await request(app)
        .get(`/${org2Name}/patients`)
        .set("Authorization", `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(org2PatientsResponse.body.patients).to.have.lengthOf(1);
      expect(org2PatientsResponse.body.patients[0].email).to.equal("org2patient1@example.com");

      // Verify org2 patients are not in org1 results
      const org2EmailsInOrg1 = org1Response.body.patients.filter((p: any) => p.email.includes("org2"));
      expect(org2EmailsInOrg1).to.have.lengthOf(0);

      // Verify org1 patients are not in org2 results
      const org1EmailsInOrg2 = org2PatientsResponse.body.patients.filter((p: any) => p.email.includes("org1"));
      expect(org1EmailsInOrg2).to.have.lengthOf(0);
    });

    it("should handle edge cases for pagination parameters", async () => {
      // Register 5 patients
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send({
            email: `patient${i}@example.com`,
            password: "password123",
            firstName: `Patient${i}`,
            lastName: "Test",
            dateOfBirth: "1990-01-15",
            phoneNumber: `555000000${i}`,
          })
          .expect(201);
      }

      // Test with offset greater than total
      const offsetTooHighResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 10, offset: 100 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(offsetTooHighResponse.body.total).to.equal(5);
      expect(offsetTooHighResponse.body.patients).to.have.lengthOf(0);

      // Test with limit 0
      const limitZeroResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 0, offset: 0 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(limitZeroResponse.body.total).to.equal(5);
      expect(limitZeroResponse.body.patients).to.have.lengthOf(0);

      // Test with negative values (should be normalized to 0)
      const negativeResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: -5, offset: -10 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(negativeResponse.body.limit).to.be.at.least(0);
      expect(negativeResponse.body.offset).to.equal(0);
    });

    it("should verify server-side pagination does not fetch all records", async () => {
      // Register 100 patients to test performance
      for (let i = 1; i <= 100; i++) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send({
            email: `patient${i}@example.com`,
            password: "password123",
            firstName: `Patient${i}`,
            lastName: "Test",
            dateOfBirth: "1990-01-15",
            phoneNumber: `555${i.toString().padStart(7, '0')}`,
          })
          .expect(201);
      }

      // Request only first 10, verify total is correct
      const response = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 10, offset: 0 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.total).to.equal(100);
      expect(response.body.patients).to.have.lengthOf(10);
      expect(response.body.limit).to.equal(10);
      expect(response.body.offset).to.equal(0);

      // Request middle page
      const middlePageResponse = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ limit: 10, offset: 50 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(middlePageResponse.body.total).to.equal(100);
      expect(middlePageResponse.body.patients).to.have.lengthOf(10);
      expect(middlePageResponse.body.offset).to.equal(50);
    }).timeout(60000);

    it("should maintain correct total count with combined search and pagination", async () => {
      // Register patients with varying attributes
      for (let i = 1; i <= 20; i++) {
        await request(app)
          .post(`/${organizationName}/patients/register`)
          .send({
            email: `patient${i}@example.com`,
            password: "password123",
            firstName: i <= 10 ? `John${i}` : `Jane${i}`,
            lastName: "Doe",
            dateOfBirth: "1990-01-15",
            phoneNumber: `555${i.toString().padStart(7, '0')}`,
          })
          .expect(201);
      }

      // Search for "John" with pagination
      const searchPage1Response = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ q: "John", limit: 5, offset: 0 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(searchPage1Response.body.total).to.equal(10); // Only 10 Johns
      expect(searchPage1Response.body.patients).to.have.lengthOf(5);

      // Get second page of search results
      const searchPage2Response = await request(app)
        .get(`/${organizationName}/patients`)
        .query({ q: "John", limit: 5, offset: 5 })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(searchPage2Response.body.total).to.equal(10);
      expect(searchPage2Response.body.patients).to.have.lengthOf(5);

      // Verify all results are Johns
      searchPage1Response.body.patients.forEach((p: any) => {
        expect(p.firstName).to.match(/^John/);
      });
      searchPage2Response.body.patients.forEach((p: any) => {
        expect(p.firstName).to.match(/^John/);
      });
    });
  });
});
