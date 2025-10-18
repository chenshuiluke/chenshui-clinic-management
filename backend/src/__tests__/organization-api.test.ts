import { describe, it } from "mocha";
import { expect } from "chai";
import request from "supertest";
import Organization from "../entities/central/organization.entity";
import { getApp, getOrm, createTestOrganization } from "./fixtures";

describe("Organization API", () => {
  let app: ReturnType<typeof getApp>;
  let orm: ReturnType<typeof getOrm>;

  before(() => {
    app = getApp();
    orm = getOrm();
  });

  describe("GET /organization", () => {
    it("should return an empty array when no organizations exist", async () => {
      const response = await request(app).get("/organization");

      expect(response.status).to.equal(
        200,
        `Expected status 200 but got ${response.status}. Response body: ${JSON.stringify(response.body)}`,
      );
      expect(response.body).to.be.an(
        "array",
        `Expected response body to be an array but got ${typeof response.body}. Body: ${JSON.stringify(response.body)}`,
      );
      expect(response.body).to.have.lengthOf(
        0,
        `Expected empty array but got ${response.body.length} organizations: ${JSON.stringify(response.body)}`,
      );
    });

    it("should return all organizations with correct structure", async () => {
      await createTestOrganization(orm, { name: "Clinic A" });
      await createTestOrganization(orm, { name: "Clinic B" });
      await createTestOrganization(orm, { name: "Clinic C" });

      const response = await request(app).get("/organization");

      expect(response.status).to.equal(
        200,
        `Expected status 200 but got ${response.status}. Response body: ${JSON.stringify(response.body)}`,
      );
      expect(response.body).to.have.lengthOf(
        3,
        `Expected 3 organizations but got ${response.body.length}. Organizations: ${JSON.stringify(response.body)}`,
      );

      response.body.forEach((org: any, index: number) => {
        expect(
          org.id,
          `Organization at index ${index} missing id field. Org: ${JSON.stringify(org)}`,
        ).to.be.ok;
        expect(
          org.name,
          `Organization at index ${index} missing name field. Org: ${JSON.stringify(org)}`,
        ).to.be.ok;
        expect(
          org.createdAt,
          `Organization at index ${index} missing createdAt field. Org: ${JSON.stringify(org)}`,
        ).to.be.ok;
        expect(
          org.updatedAt,
          `Organization at index ${index} missing updatedAt field. Org: ${JSON.stringify(org)}`,
        ).to.be.ok;
        expect(org.id).to.be.a(
          "number",
          `Organization at index ${index} has non-number id: ${org.id} (type: ${typeof org.id})`,
        );
        expect(org.name).to.be.a(
          "string",
          `Organization at index ${index} has non-string name: ${org.name} (type: ${typeof org.name})`,
        );
      });
    });

    it("should return organizations in consistent order", async () => {
      await createTestOrganization(orm, { name: "Alpha Clinic" });
      await createTestOrganization(orm, { name: "Beta Clinic" });

      const response1 = await request(app).get("/organization");
      const response2 = await request(app).get("/organization");

      expect(response1.body).to.deep.equal(
        response2.body,
        `Organizations returned in different order. First call: ${JSON.stringify(response1.body)}, Second call: ${JSON.stringify(response2.body)}`,
      );
    });
  });

  describe("POST /organization", () => {
    it("should create organization with valid data", async () => {
      const newOrg = {
        name: "New Medical Center",
      };

      const response = await request(app)
        .post("/organization")
        .send(newOrg)
        .set("Content-Type", "application/json");

      expect(response.status).to.equal(
        201,
        `Expected status 201 but got ${response.status}. Request: ${JSON.stringify(newOrg)}, Response: ${JSON.stringify(response.body)}`,
      );
      expect(
        response.body.id,
        `Created organization missing id field. Response: ${JSON.stringify(response.body)}`,
      ).to.be.ok;
      expect(response.body.name).to.equal(
        newOrg.name,
        `Expected name "${newOrg.name}" but got "${response.body.name}". Response: ${JSON.stringify(response.body)}`,
      );
      expect(
        response.body.createdAt,
        `Created organization missing createdAt field. Response: ${JSON.stringify(response.body)}`,
      ).to.be.ok;
      expect(
        response.body.updatedAt,
        `Created organization missing updatedAt field. Response: ${JSON.stringify(response.body)}`,
      ).to.be.ok;
    });

    it("should persist organization to database", async () => {
      const newOrg = {
        name: "Persistent Clinic",
      };

      const response = await request(app).post("/organization").send(newOrg);

      const em = orm.em.fork();
      const savedOrg = await em.findOne(Organization, { id: response.body.id });

      expect(
        savedOrg,
        `Organization not found in database with id ${response.body.id}. Response: ${JSON.stringify(response.body)}`,
      ).to.be.ok;
      expect(savedOrg!.name).to.equal(
        newOrg.name,
        `Expected saved name "${newOrg.name}" but got "${savedOrg!.name}". Saved org: ${JSON.stringify(savedOrg)}`,
      );
    });

    it("should reject invalid name values", async () => {
      const invalidNames = [{}, { name: null }, { name: "" }, { name: 12345 }];

      for (const invalidData of invalidNames) {
        const response = await request(app)
          .post("/organization")
          .send(invalidData)
          .set("Content-Type", "application/json");

        expect(response.status).to.equal(
          400,
          `Expected status 400 for invalid data ${JSON.stringify(invalidData)} but got ${response.status}. Response: ${JSON.stringify(response.body)}`,
        );
        expect(
          response.body.error,
          `Expected error field in response for invalid data ${JSON.stringify(invalidData)}. Response: ${JSON.stringify(response.body)}`,
        ).to.be.ok;
      }
    });

    it("should handle duplicate organization names", async () => {
      const orgName = "Duplicate Medical Center";

      await createTestOrganization(orm, { name: orgName });

      const response = await request(app)
        .post("/organization")
        .send({ name: orgName });

      expect([400, 409, 500]).to.include(
        response.status,
        `Expected status 400, 409, or 500 for duplicate name "${orgName}" but got ${response.status}. Response: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("Organization Data Integrity", () => {
    it("should auto-generate id for new organizations", async () => {
      const response = await request(app)
        .post("/organization")
        .send({ name: "Auto ID Clinic" });

      expect(
        response.body.id,
        `Created organization missing id field. Response: ${JSON.stringify(response.body)}`,
      ).to.be.ok;
      expect(response.body.id).to.be.a(
        "number",
        `Expected id to be a number but got ${typeof response.body.id}. Id value: ${response.body.id}`,
      );
      expect(response.body.id).to.be.greaterThan(
        0,
        `Expected id to be greater than 0 but got ${response.body.id}`,
      );
    });

    it("should set createdAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organization")
        .send({ name: "Timestamp Clinic" });

      const afterCreate = new Date();
      const createdAt = new Date(response.body.createdAt);

      expect(createdAt.getTime()).to.be.at.least(
        beforeCreate.getTime(),
        `Expected createdAt ${createdAt.toISOString()} to be at or after ${beforeCreate.toISOString()}. Response: ${JSON.stringify(response.body)}`,
      );
      expect(createdAt.getTime()).to.be.at.most(
        afterCreate.getTime(),
        `Expected createdAt ${createdAt.toISOString()} to be at or before ${afterCreate.toISOString()}. Response: ${JSON.stringify(response.body)}`,
      );
    });

    it("should set updatedAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organization")
        .send({ name: "Updated Clinic" });

      const afterCreate = new Date();
      const updatedAt = new Date(response.body.updatedAt);

      expect(updatedAt.getTime()).to.be.at.least(
        beforeCreate.getTime(),
        `Expected updatedAt ${updatedAt.toISOString()} to be at or after ${beforeCreate.toISOString()}. Response: ${JSON.stringify(response.body)}`,
      );
      expect(updatedAt.getTime()).to.be.at.most(
        afterCreate.getTime(),
        `Expected updatedAt ${updatedAt.toISOString()} to be at or before ${afterCreate.toISOString()}. Response: ${JSON.stringify(response.body)}`,
      );
    });

    it("should increment organization IDs", async () => {
      const response1 = await request(app)
        .post("/organization")
        .send({ name: "First Clinic" });

      const response2 = await request(app)
        .post("/organization")
        .send({ name: "Second Clinic" });

      expect(response2.body.id).to.be.greaterThan(
        response1.body.id,
        `Expected second organization id ${response2.body.id} to be greater than first organization id ${response1.body.id}. First org: ${JSON.stringify(response1.body)}, Second org: ${JSON.stringify(response2.body)}`,
      );
    });
  });
});
