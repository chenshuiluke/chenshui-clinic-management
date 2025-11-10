import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import OrganizationUser, { OrganizationUserRole } from "../entities/distributed/organization_user";
import AdminProfile from "../entities/distributed/admin_profile";
import DoctorProfile from "../entities/distributed/doctor_profile";
import {
  getApp,
  getOrm,
  createTestUser,
  trackOrganization,
} from "./fixtures";
import jwtService from "../services/jwt.service";
import { getOrgEm } from "../db/organization-db";
import { OrgJWTPayload } from "../config/jwt.config";

describe("Doctor API", () => {
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
      .send({ name: `Test Hospital Doctor ${Date.now()}` })
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

  describe("POST /:orgName/doctors", () => {
    it("should create a doctor user with valid data", async () => {
      const doctorData = {
        email: "doctor@hospital.com",
        password: "password123",
        firstName: "John",
        lastName: "Smith",
        specialization: "Cardiology",
        licenseNumber: "MD123456",
        phoneNumber: "555-1234",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      expect(
        response.body,
        `Expected id in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("id");
      expect(response.body).to.have.property("email", doctorData.email);
      expect(response.body).to.have.property("firstName", doctorData.firstName);
      expect(response.body).to.have.property("lastName", doctorData.lastName);
      expect(response.body).to.have.property("role", "doctor");
      expect(response.body).to.have.property(
        "specialization",
        doctorData.specialization,
      );
      expect(response.body).to.have.property(
        "licenseNumber",
        doctorData.licenseNumber,
      );
      expect(response.body).to.not.have.property(
        "password",
        `Password should not be returned in response but got: ${JSON.stringify(response.body)}`,
      );

      // Verify in database
      const orgEm = await getOrgEm(organizationName);
      const savedDoctor = await orgEm.findOne(
        OrganizationUser,
        { email: doctorData.email },
        { populate: ["doctorProfile"] },
      );

      expect(savedDoctor).to.not.be.null;
      expect(savedDoctor!.firstName).to.equal(doctorData.firstName);
      expect(savedDoctor!.lastName).to.equal(doctorData.lastName);
      expect(savedDoctor!.doctorProfile).to.not.be.undefined;
      expect(savedDoctor!.doctorProfile!.specialization).to.equal(
        doctorData.specialization,
      );
      expect(savedDoctor!.doctorProfile!.licenseNumber).to.equal(
        doctorData.licenseNumber,
      );
      expect(savedDoctor!.doctorProfile!.phoneNumber).to.equal(
        doctorData.phoneNumber,
      );

      // Verify password is hashed
      expect(
        await jwtService.comparePassword(
          doctorData.password,
          savedDoctor!.password,
        ),
        `Password hash verification failed for doctor ${doctorData.email}`,
      ).to.be.true;
    });

    it("should create doctor without optional phoneNumber", async () => {
      const doctorData = {
        email: "doctor2@hospital.com",
        password: "password123",
        firstName: "Jane",
        lastName: "Doe",
        specialization: "Neurology",
        licenseNumber: "MD789012",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      expect(response.body).to.have.property("id");
      expect(response.body).to.have.property("email", doctorData.email);
      expect(response.body).to.have.property("role", "doctor");

      // Verify in database
      const orgEm = await getOrgEm(organizationName);
      const savedDoctor = await orgEm.findOne(
        OrganizationUser,
        { email: doctorData.email },
        { populate: ["doctorProfile"] },
      );

      expect(savedDoctor).to.not.be.null;
      expect(savedDoctor!.doctorProfile).to.not.be.undefined;
      expect(savedDoctor!.doctorProfile!.phoneNumber).to.be.null;
    });

    it("should require admin authentication", async () => {
      const doctorData = {
        email: "doctor@hospital.com",
        password: "password123",
        firstName: "John",
        lastName: "Smith",
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .send(doctorData)
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject non-admin users", async () => {
      // Create a doctor user
      const orgEm = await getOrgEm(organizationName);
      const hashedPassword = await jwtService.hashPassword("doctorpass123");

      const existingDoctorProfile = orgEm.create(DoctorProfile, {
        specialization: "Surgery",
        licenseNumber: "MD111111",
      });
      const existingDoctor = orgEm.create(OrganizationUser, {
        email: "existing@hospital.com",
        password: hashedPassword,
        firstName: "Existing",
        lastName: "Doctor",
        doctorProfile: existingDoctorProfile,
      });

      await orgEm.persistAndFlush([existingDoctorProfile, existingDoctor]);

      // Generate token for doctor user
      const doctorPayload: OrgJWTPayload = {
        userId: existingDoctor.id,
        email: existingDoctor.email,
        name: `${existingDoctor.firstName} ${existingDoctor.lastName}`,
        orgName: organizationName,
        role: OrganizationUserRole.DOCTOR,
      };
      const doctorToken = jwtService.generateAccessToken(doctorPayload);

      const newDoctorData = {
        email: "newdoctor@hospital.com",
        password: "password123",
        firstName: "New",
        lastName: "Doctor",
        specialization: "Pediatrics",
        licenseNumber: "MD999999",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send(newDoctorData)
        .expect(403);

      expect(response.body).to.have.property(
        "error",
        "Admin access required",
        `Expected admin required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject duplicate email in the same organization", async () => {
      const doctorData = {
        email: "duplicate@hospital.com",
        password: "password123",
        firstName: "First",
        lastName: "Doctor",
        specialization: "Dermatology",
        licenseNumber: "MD222222",
      };

      // Create first doctor
      await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      // Try to create second doctor with same email
      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...doctorData,
          firstName: "Second",
          licenseNumber: "MD333333",
        })
        .expect(409);

      expect(response.body).to.have.property(
        "error",
        "User with this email already exists in the organization",
        `Expected duplicate email error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate email format", async () => {
      const invalidEmail = "not-an-email";
      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: invalidEmail,
          password: "password123",
          firstName: "John",
          lastName: "Smith",
          specialization: "Cardiology",
          licenseNumber: "MD123456",
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
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "doctor@hospital.com",
          password: shortPassword,
          firstName: "John",
          lastName: "Smith",
          specialization: "Cardiology",
          licenseNumber: "MD123456",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for password length ${shortPassword.length} but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require firstName field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "doctor@hospital.com",
          password: "password123",
          lastName: "Smith",
          specialization: "Cardiology",
          licenseNumber: "MD123456",
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
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "doctor@hospital.com",
          password: "password123",
          firstName: "John",
          specialization: "Cardiology",
          licenseNumber: "MD123456",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing lastName but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require specialization field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "doctor@hospital.com",
          password: "password123",
          firstName: "John",
          lastName: "Smith",
          licenseNumber: "MD123456",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing specialization but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should require licenseNumber field", async () => {
      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "doctor@hospital.com",
          password: "password123",
          firstName: "John",
          lastName: "Smith",
          specialization: "Cardiology",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing licenseNumber but got: ${JSON.stringify(response.body)}`,
      );
    });


    it("should handle various specialization types", async () => {
      const specializations = [
        "Cardiology",
        "Neurology",
        "Pediatrics",
        "Internal Medicine",
        "Emergency Medicine",
        "Orthopedic Surgery",
      ];

      for (let i = 0; i < specializations.length; i++) {
        const doctorData = {
          email: `doctor${i}@hospital.com`,
          password: "password123",
          firstName: "Doctor",
          lastName: `Number${i}`,
          specialization: specializations[i],
          licenseNumber: `MD${i}${i}${i}${i}${i}${i}`,
        };

        const response = await request(app)
          .post(`/${organizationName}/doctors`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send(doctorData)
          .expect(201);

        expect(response.body).to.have.property(
          "specialization",
          specializations[i],
        );
      }
    });

    it("should isolate doctors between different organizations", async () => {
      // Create another organization via API
      const org2Response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${centralAuthToken}`)
        .send({ name: `Another Hospital ${Date.now()}` })
        .expect(201);

      const org2Name = org2Response.body.name;
      trackOrganization(org2Name);

      // Create admin in org2
      const org2Em = await getOrgEm(org2Name);
      const hashedPassword = await jwtService.hashPassword("adminpass123");

      const admin2Profile = org2Em.create(AdminProfile, {});
      const admin2User = org2Em.create(OrganizationUser, {
        email: "admin@anotherhospital.com",
        password: hashedPassword,
        firstName: "Admin2",
        lastName: "User2",
        adminProfile: admin2Profile,
      });

      await org2Em.persistAndFlush([admin2Profile, admin2User]);

      const admin2Payload: OrgJWTPayload = {
        userId: admin2User.id,
        email: admin2User.email,
        name: `${admin2User.firstName} ${admin2User.lastName}`,
        orgName: org2Name,
        role: OrganizationUserRole.ADMIN,
      };
      const admin2Token = jwtService.generateAccessToken(admin2Payload);

      // Create doctor in org1
      const doctorData = {
        email: "shared@email.com",
        password: "password123",
        firstName: "John",
        lastName: "Smith",
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      };

      await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      // Should be able to create doctor with same email in org2
      const response = await request(app)
        .post(`/${org2Name}/doctors`)
        .set("Authorization", `Bearer ${admin2Token}`)
        .send({
          ...doctorData,
          specialization: "Neurology",
          licenseNumber: "MD999999",
        })
        .expect(201);

      expect(response.body).to.have.property("email", doctorData.email);
      expect(response.body).to.have.property("specialization", "Neurology");

      // Verify they exist in separate databases
      const org1Em = await getOrgEm(organizationName);
      const org1Doctor = await org1Em.findOne(OrganizationUser, {
        email: doctorData.email,
      }, { populate: ["doctorProfile"] });
      expect(org1Doctor).to.not.be.null;

      const org2Doctor = await org2Em.findOne(OrganizationUser, {
        email: doctorData.email,
      }, { populate: ["doctorProfile"] });
      expect(org2Doctor).to.not.be.null;

      // Verify they have different specializations (proving they're isolated)
      expect(org1Doctor!.doctorProfile!.specialization).to.equal("Cardiology");
      expect(org2Doctor!.doctorProfile!.specialization).to.equal("Neurology");
    });

    it("should reject token without orgName field", async () => {
      // Generate token without orgName field (using JWTPayload instead of OrgJWTPayload)
      const tokenWithoutOrg = jwtService.generateAccessToken({
        userId: 1,
        email: "admin@hospital.com",
        name: "Admin User",
      } as any);

      const doctorData = {
        email: "doctor@hospital.com",
        password: "password123",
        firstName: "John",
        lastName: "Smith",
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${tokenWithoutOrg}`)
        .send(doctorData)
        .expect(401);

      expect(response.body).to.have.property("error", "Organization token required");
    });

    it("should reject token with mismatched orgName", async () => {
      // Generate token with different orgName
      const mismatchedPayload: OrgJWTPayload = {
        userId: 1,
        email: "admin@hospital.com",
        name: "Admin User",
        orgName: "Different Organization",
        role: OrganizationUserRole.ADMIN,
      };
      const mismatchedToken = jwtService.generateAccessToken(mismatchedPayload);

      const doctorData = {
        email: "doctor@hospital.com",
        password: "password123",
        firstName: "John",
        lastName: "Smith",
        specialization: "Cardiology",
        licenseNumber: "MD123456",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${mismatchedToken}`)
        .send(doctorData)
        .expect(401);

      expect(response.body).to.have.property("error", "Token organization mismatch");
    });

  });

  describe("Doctor Data Integrity", () => {
    it("should store all doctor profile fields correctly", async () => {
      const doctorData = {
        email: "complete@hospital.com",
        password: "password123",
        firstName: "Complete",
        lastName: "Doctor",
        specialization: "Oncology",
        licenseNumber: "MD555555",
        phoneNumber: "555-9999",
      };

      const response = await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      const doctorId = response.body.id;

      // Fetch from database and verify all fields
      const orgEm = await getOrgEm(organizationName);
      const savedDoctor = await orgEm.findOne(
        OrganizationUser,
        { id: doctorId },
        { populate: ["doctorProfile"] },
      );

      expect(savedDoctor).to.not.be.null;
      expect(savedDoctor!.email).to.equal(doctorData.email);
      expect(savedDoctor!.firstName).to.equal(doctorData.firstName);
      expect(savedDoctor!.lastName).to.equal(doctorData.lastName);
      expect(savedDoctor!.doctorProfile).to.not.be.undefined;
      expect(savedDoctor!.doctorProfile!.specialization).to.equal(
        doctorData.specialization,
      );
      expect(savedDoctor!.doctorProfile!.licenseNumber).to.equal(
        doctorData.licenseNumber,
      );
      expect(savedDoctor!.doctorProfile!.phoneNumber).to.equal(
        doctorData.phoneNumber,
      );
    });

    it("should ensure only one role per user", async () => {
      const doctorData = {
        email: "singlerole@hospital.com",
        password: "password123",
        firstName: "Single",
        lastName: "Role",
        specialization: "Psychiatry",
        licenseNumber: "MD777777",
      };

      await request(app)
        .post(`/${organizationName}/doctors`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(doctorData)
        .expect(201);

      // Verify in database that user has only doctorProfile set
      const orgEm = await getOrgEm(organizationName);
      const savedDoctor = await orgEm.findOne(
        OrganizationUser,
        { email: doctorData.email },
        { populate: ["doctorProfile", "adminProfile", "patientProfile"] },
      );

      expect(savedDoctor).to.not.be.null;
      expect(savedDoctor!.doctorProfile).to.not.be.undefined;
      expect(savedDoctor!.adminProfile).to.be.null;
      expect(savedDoctor!.patientProfile).to.be.null;
    });
  });
});
