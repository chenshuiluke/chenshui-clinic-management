import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import { mockClient } from "aws-sdk-client-mock";
import {
  SecretsManagerClient,
  CreateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import Organization from "../entities/central/organization";
import {
  getApp,
  getOrm,
  createTestOrganization,
  createTestUser,
} from "./fixtures";
import { jwtService } from "../services/jwt.service";
import { setSecretsClient } from "../services/organization";

describe("Organization API", () => {
  let app: ReturnType<typeof getApp>;
  let orm: ReturnType<typeof getOrm>;
  let authToken: string;
  const secretsManagerMock = mockClient(SecretsManagerClient);

  beforeEach(async () => {
    app = getApp();
    orm = getOrm();

    // Reset and configure AWS mock
    secretsManagerMock.reset();
    secretsManagerMock.on(CreateSecretCommand).resolves({
      ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
      Name: "test-secret",
      VersionId: "test-version",
    });

    // Inject the mock client
    const mockClient = new SecretsManagerClient({ region: "us-east-1" });
    setSecretsClient(mockClient);

    // Set required environment variables for tests
    process.env.NODE_ENV = "test";

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

  afterEach(() => {
    secretsManagerMock.reset();
  });

  describe("GET /organizations", () => {
    it("should require authentication", async () => {
      const response = await request(app).get("/organizations").expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
      );
    });

    it("should return an empty array when no organizations exist", async () => {
      const response = await request(app)
        .get("/organizations")
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
        .get("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).to.have.lengthOf(3);

      response.body.forEach((org: any) => {
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
        .get("/organizations")
        .set("Authorization", `Bearer ${authToken}`);

      const response2 = await request(app)
        .get("/organizations")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response1.body).to.deep.equal(response2.body);
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .get("/organizations")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid or expired token",
      );
    });
  });

  describe("POST /organizations", () => {
    it("should require authentication", async () => {
      const response = await request(app)
        .post("/organizations")
        .send({ name: "New Clinic" })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
      );
    });

    it("should create organization with database and return correct structure", async () => {
      const newOrg = {
        name: "New Medical Center",
      };

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newOrg)
        .set("Content-Type", "application/json")
        .expect(201);

      // Check basic organization fields
      expect(response.body).to.have.property("id").that.is.a("number");
      expect(response.body).to.have.property("name", newOrg.name);
      expect(response.body).to.have.property("createdAt");
      expect(response.body).to.have.property("updatedAt");

      // Check database creation result
      expect(response.body).to.have.property("database");
      expect(response.body.database).to.have.property("created", true);
      expect(response.body.database).to.have.property(
        "dbName",
        "clinic_new_medical_center",
      );
      expect(response.body.database).to.have.property(
        "secretName",
        "clinic-db-new_medical_center",
      );
      expect(response.body.database)
        .to.have.property("message")
        .that.includes("Successfully created");
    });

    it("should rollback organization creation if db creation fails", async () => {
      // Make secrets manager fail
      secretsManagerMock.reset();
      secretsManagerMock
        .on(CreateSecretCommand)
        .rejects(new Error("AWS Error"));

      const newOrg = {
        name: "Rollback Clinic",
      };

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newOrg)
        .expect(500);

      // Organization creation should fail
      expect(response.body).to.have.property("error");

      // Verify organization was NOT persisted
      const em = orm.em.fork();
      const savedOrg = await em.findOne(Organization, {
        name: newOrg.name,
      });
      expect(savedOrg).to.be.null;
    });

    it("should create database with correct naming convention", async () => {
      const testCases = [
        {
          orgName: "Test Clinic",
          expectedDb: "clinic_test_clinic",
          expectedSecret: "clinic-db-test_clinic",
        },
        {
          orgName: "My-Clinic!",
          expectedDb: "clinic_my_clinic_",
          expectedSecret: "clinic-db-my_clinic_",
        },
        {
          orgName: "Clinic 123",
          expectedDb: "clinic_clinic_123",
          expectedSecret: "clinic-db-clinic_123",
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: testCase.orgName })
          .expect(201);

        expect(response.body.database.dbName).to.equal(testCase.expectedDb);
        expect(response.body.database.secretName).to.equal(
          testCase.expectedSecret,
        );
      }
    });

    it("should call AWS Secrets Manager with correct parameters", async () => {
      const orgName = "Secret Test Clinic";

      await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: orgName })
        .expect(201);

      // Verify the mock was called
      const calls = secretsManagerMock.commandCalls(CreateSecretCommand);
      expect(calls).to.have.lengthOf(1);

      const call = calls[0];
      expect(call).to.not.be.undefined;
      expect(call!.args[0].input.Name).to.equal("clinic-db-secret_test_clinic");
      expect(call!.args[0].input.Description).to.include(orgName);

      // Check secret value structure
      const secretValue = JSON.parse(call!.args[0].input.SecretString || "{}");
      expect(secretValue).to.have.property(
        "username",
        "secret_test_clinic_user",
      );
      expect(secretValue).to.have.property("password").that.is.a("string");
      expect(secretValue).to.have.property("engine", "postgres");
      expect(secretValue).to.have.property("host", process.env.DB_HOST);
      expect(secretValue).to.have.property(
        "port",
        parseInt(`${process.env.DB_PORT}`),
      );
      expect(secretValue).to.have.property(
        "dbname",
        "clinic_secret_test_clinic",
      );

      // Check tags
      const tags = call!.args[0].input.Tags || [];
      const tagMap = tags.reduce((acc: any, tag: any) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {});

      expect(tagMap).to.have.property("Organization", orgName);
    });

    it("should reject invalid name values", async () => {
      const invalidNames = [{}, { name: null }, { name: "" }, { name: 12345 }];

      for (const invalidData of invalidNames) {
        const response = await request(app)
          .post("/organizations")
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
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: orgName });

      expect([400, 409, 500]).to.include(response.status);
      if (response.status === 409) {
        expect(response.body.error).to.include("already exists");
      }
    });

    it("should fail organization creation when database environment variables are missing", async () => {
      // Temporarily remove env vars
      const originalHost = process.env.DB_HOST;
      const originalUser = process.env.DB_USER;
      const originalPassword = process.env.DB_PASSWORD;

      try {
        delete process.env.DB_HOST;
        delete process.env.DB_USER;
        delete process.env.DB_PASSWORD;

        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: "No DB Config Clinic" })
          .expect(500);

        // Organization creation should fail
        expect(response.body).to.have.property("error");
        expect(response.body.error).to.include("Failed to create organization");

        // Verify organization was NOT persisted
        const em = orm.em.fork();
        const savedOrg = await em.findOne(Organization, {
          name: "No DB Config Clinic",
        });
        expect(savedOrg).to.be.null;
      } finally {
        // Always restore env vars, even if test fails
        process.env.DB_HOST = originalHost;
        process.env.DB_USER = originalUser;
        process.env.DB_PASSWORD = originalPassword;
      }
    });
  });

  describe("Organization Data Integrity", () => {
    it("should auto-generate id for new organizations", async () => {
      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Auto ID Clinic" })
        .expect(201);

      expect(response.body.id).to.be.a("number");
      expect(response.body.id).to.be.greaterThan(0);
    });

    it("should set createdAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organizations")
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
        .post("/organizations")
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
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "First Clinic" })
        .expect(201);

      const response2 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Second Clinic" })
        .expect(201);

      expect(response2.body.id).to.be.greaterThan(response1.body.id);
    });

    it("should generate unique database names for each organization", async () => {
      const response1 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Unique DB One" })
        .expect(201);

      const response2 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Unique DB Two" })
        .expect(201);

      expect(response1.body.database.dbName).to.not.equal(
        response2.body.database.dbName,
      );
      expect(response1.body.database.secretName).to.not.equal(
        response2.body.database.secretName,
      );
    });
  });

  describe("Database Creation Edge Cases", () => {
    it("should handle organizations with special characters in names", async () => {
      const specialNameCases = [
        "Test & Associates",
        "Clinic #1",
        "Dr. Smith's Practice",
        "50% Off Clinic",
        "Clinic (Main)",
        "Test/Clinic 1",
      ];

      for (const name of specialNameCases) {
        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name })
          .expect(201);

        expect(response.body.database.dbName).to.match(/^clinic_[a-z0-9_]+$/);
        expect(response.body.database.secretName).to.match(
          /^clinic-db-[a-z0-9_]+$/,
        );
      }
    });

    it("should handle very long organization names", async () => {
      const longName = "A".repeat(100) + " Medical Center";

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: longName })
        .expect(201);

      expect(response.body.name).to.equal(longName);
      expect(response.body.database.dbName).to.have.lengthOf.below(200);
    });

    it("should rollback on AWS Secrets Manager failures", async () => {
      // Configure mock to fail after first success
      let callCount = 0;
      secretsManagerMock.on(CreateSecretCommand).callsFake(() => {
        callCount++;
        if (callCount > 1) {
          throw new Error("ResourceExistsException: Secret already exists");
        }
        return {
          ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
          Name: "test-secret",
          VersionId: "test-version",
        };
      });

      // First call should succeed
      const response1 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "First AWS Success" })
        .expect(201);

      expect(response1.body.database.created).to.be.true;

      // Second call should fail completely and rollback
      const response2 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Second AWS Fail" })
        .expect(500);

      expect(response2.body).to.have.property("error");

      // Verify second organization was NOT persisted
      const em = orm.em.fork();
      const savedOrg = await em.findOne(Organization, {
        name: "Second AWS Fail",
      });
      expect(savedOrg).to.be.null;
    });
  });
});
