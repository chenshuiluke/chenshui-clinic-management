import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import Organization from "../entities/central/organization.entity";
import {
  getApp,
  getOrm,
  createTestOrganization,
  createTestUser,
} from "./fixtures";
import { jwtService } from "../services/jwt.service";

describe("Organization API", () => {
  let app: ReturnType<typeof getApp>;
  let orm: ReturnType<typeof getOrm>;
  let authToken: string;

  beforeEach(async () => {
    app = getApp();
    orm = getOrm();

    // Create a test user and generate auth token for protected routes
    const user = await createTestUser(orm, {
      email: "admin@test.com",
      name: "Test Admin",
      password: "password123",
    });

    authToken = jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
  });

  describe("GET /organization", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/organization").expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
      );
    });

    it("should return an empty array when no organizations exist", async () => {
      const response = await request(app)
        .get("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.be.an("array");
      expect(response.body).to.have.lengthOf(0);
    });

    it("should return all organizations with correct structure", async () => {
      await createTestOrganization(orm, { name: "Clinic A" });
      await createTestOrganization(orm, { name: "Clinic B" });
      await createTestOrganization(orm, { name: "Clinic C" });

      const response = await request(app)
        .get("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.lengthOf(3);

      response.body.forEach((org: any, index: number) => {
        expect(org).to.have.property("id").that.is.a("number");
        expect(org).to.have.property("name").that.is.a("string");
        expect(org).to.have.property("createdAt");
        expect(org).to.have.property("updatedAt");
      });
    });

    it("should return organizations in consistent order", async () => {
      await createTestOrganization(orm, { name: "Alpha Clinic" });
      await createTestOrganization(orm, { name: "Beta Clinic" });

      const response1 = await request(app)
        .get("/organization")
        .set("Authorization", `Bearer ${authToken}`);

      const response2 = await request(app)
        .get("/organization")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response1.body).to.deep.equal(response2.body);
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .get("/organization")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid or expired token",
      );
    });
  });

  describe("POST /organization", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .post("/organization")
        .send({ name: "New Clinic" })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
      );
    });

    it("should create organization with valid data", async () => {
      const newOrg = {
        name: "New Medical Center",
      };

      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newOrg)
        .set("Content-Type", "application/json")
        .expect(201);

      expect(response.body).to.have.property("id").that.is.a("number");
      expect(response.body).to.have.property("name", newOrg.name);
      expect(response.body).to.have.property("createdAt");
      expect(response.body).to.have.property("updatedAt");
    });

    it("should persist organization to database", async () => {
      const newOrg = {
        name: "Persistent Clinic",
      };

      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newOrg)
        .expect(201);

      const em = orm.em.fork();
      const savedOrg = await em.findOne(Organization, { id: response.body.id });

      expect(savedOrg).to.exist;
      expect(savedOrg!.name).to.equal(newOrg.name);
    });

    it("should reject invalid name values", async () => {
      const invalidNames = [{}, { name: null }, { name: "" }, { name: 12345 }];

      for (const invalidData of invalidNames) {
        const response = await request(app)
          .post("/organization")
          .set("Authorization", `Bearer ${authToken}`)
          .send(invalidData)
          .set("Content-Type", "application/json")
          .expect(400);

        expect(response.body).to.have.property("error");
      }
    });

    it("should handle duplicate organization names", async () => {
      const orgName = "Duplicate Medical Center";

      await createTestOrganization(orm, { name: orgName });

      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: orgName });

      expect([400, 409, 500]).to.include(response.status);
    });
  });

  describe("Organization Data Integrity", () => {
    it("should auto-generate id for new organizations", async () => {
      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Auto ID Clinic" })
        .expect(201);

      expect(response.body.id).to.be.a("number");
      expect(response.body.id).to.be.greaterThan(0);
    });

    it("should set createdAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Timestamp Clinic" })
        .expect(201);

      const afterCreate = new Date();
      const createdAt = new Date(response.body.createdAt);

      expect(createdAt.getTime()).to.be.at.least(beforeCreate.getTime());
      expect(createdAt.getTime()).to.be.at.most(afterCreate.getTime());
    });

    it("should set updatedAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Updated Clinic" })
        .expect(201);

      const afterCreate = new Date();
      const updatedAt = new Date(response.body.updatedAt);

      expect(updatedAt.getTime()).to.be.at.least(beforeCreate.getTime());
      expect(updatedAt.getTime()).to.be.at.most(afterCreate.getTime());
    });

    it("should increment organization IDs", async () => {
      const response1 = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "First Clinic" })
        .expect(201);

      const response2 = await request(app)
        .post("/organization")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Second Clinic" })
        .expect(201);

      expect(response2.body.id).to.be.greaterThan(response1.body.id);
    });
  });
});
