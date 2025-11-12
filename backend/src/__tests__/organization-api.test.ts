import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { organizationTable } from "../db/schema/central/schema";
import { Organization as DrizzleOrganization } from "../db/schema/central/types";
import {
  getApp,
  createTestOrganization,
  createTestUser,
  trackOrganization,
  getDb,
} from "./fixtures";
import jwtService from "../services/jwt.service";
import {
  getOrgDbName,
  getOrgDbUser,
  getOrgSecretName,
} from "../utils/organization";
import { secretsManagerService } from "../services/secrets-manager.service";

describe("Organization API", () => {
  let app: ReturnType<typeof getApp>;
  let db: any;
  let authToken: string;

  // Test-local helper functions for unique names and expectations
  function makeUniqueName(base: string): string {
    return `${base} ${Date.now()}`;
  }

  function expectedDb(name: string): string {
    return getOrgDbName(name);
  }

  function expectedSecret(name: string): string {
    return getOrgSecretName(name);
  }

  beforeEach(async () => {
    app = getApp();
    db = getDb();

    // Set required environment variables for tests
    process.env.NODE_ENV = "test";

    // Create a test user and generate auth token for protected routes
    const user = await createTestUser(db, {
      email: "admin@test.com",
      name: "Test Admin",
      password: "password123",
    });

    authToken = jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      type: "central",
    });
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
      await createTestOrganization(db, { name: "Clinic A" });
      await createTestOrganization(db, { name: "Clinic B" });
      await createTestOrganization(db, { name: "Clinic C" });

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
      await createTestOrganization(db, { name: "Alpha Clinic" });
      await createTestOrganization(db, { name: "Beta Clinic" });

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
        name: `New Medical Center ${Date.now()}`,
      };

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send(newOrg)
        .set("Content-Type", "application/json")
        .expect(201);

      trackOrganization(response.body.name);

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
        expectedDb(newOrg.name),
      );
      expect(response.body.database).to.have.property(
        "secretName",
        expectedSecret(newOrg.name),
      );
      expect(response.body.database)
        .to.have.property("message")
        .that.includes("Successfully created");
    });

    it("should create database with correct naming convention", async () => {
      const testCases = [
        {
          orgName: makeUniqueName("Test Clinic"),
        },
        {
          orgName: makeUniqueName("My-Clinic!"),
        },
        {
          orgName: makeUniqueName("Clinic 123"),
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: testCase.orgName })
          .expect(201);

        trackOrganization(testCase.orgName);

        expect(response.body.database.dbName).to.equal(
          expectedDb(testCase.orgName),
        );
        expect(response.body.database.secretName).to.equal(
          expectedSecret(testCase.orgName),
        );
      }
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
      const orgName = `Duplicate Medical Center ${Date.now()}`;

      await createTestOrganization(db, { name: orgName });

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
      const orgName = `No DB Config Clinic ${Date.now()}`;

      try {
        delete process.env.DB_HOST;
        delete process.env.DB_USER;
        delete process.env.DB_PASSWORD;

        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: orgName })
          .expect(500);

        // Organization creation should fail
        expect(response.body).to.have.property("error");
        expect(response.body.error).to.include("Failed to create organization");

        // Verify organization was NOT persisted
        const orgs = await db
          .select()
          .from(organizationTable)
          .where(eq(organizationTable.name, orgName));
        const savedOrg = orgs.length > 0 ? orgs[0] : null;
        expect(savedOrg).to.be.null;
      } finally {
        // Always restore env vars, even if test fails
        process.env.DB_HOST = originalHost;
        process.env.DB_USER = originalUser;
        process.env.DB_PASSWORD = originalPassword;

        // Note: This test expects failure, but track defensively
        const orgs = await db
          .select()
          .from(organizationTable)
          .where(eq(organizationTable.name, orgName));
        const org = orgs.length > 0 ? orgs[0] : null;
        if (org) {
          trackOrganization(orgName);
        }
      }
    });
  });

  describe("Organization Data Integrity", () => {
    it("should auto-generate id for new organizations", async () => {
      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Auto ID Clinic ${Date.now()}` })
        .expect(201);

      trackOrganization(response.body.name);

      expect(response.body.id).to.be.a("number");
      expect(response.body.id).to.be.greaterThan(0);
    });

    it("should set createdAt timestamp", async () => {
      const beforeCreate = new Date();

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Timestamp Clinic ${Date.now()}` })
        .expect(201);

      trackOrganization(response.body.name);

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
        .send({ name: `Updated Clinic ${Date.now()}` })
        .expect(201);

      trackOrganization(response.body.name);

      const afterCreate = new Date();
      const updatedAt = new Date(response.body.updatedAt);

      expect(updatedAt.getTime()).to.be.at.least(beforeCreate.getTime());
      expect(updatedAt.getTime()).to.be.at.most(afterCreate.getTime());
    });

    it("should increment organization IDs", async () => {
      const response1 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `First Clinic ${Date.now()}` })
        .expect(201);

      trackOrganization(response1.body.name);

      const response2 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Second Clinic ${Date.now()}` })
        .expect(201);

      trackOrganization(response2.body.name);

      expect(response2.body.id).to.be.greaterThan(response1.body.id);
    });

    it("should generate unique database names for each organization", async () => {
      const response1 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Unique DB One ${Date.now()}` })
        .expect(201);

      trackOrganization(response1.body.name);

      const response2 = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Unique DB Two ${Date.now()}` })
        .expect(201);

      trackOrganization(response2.body.name);

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
      const timestamp = Date.now();
      const specialNameCases = [
        `Test & Associates ${timestamp}`,
        `Clinic #1 ${timestamp}`,
        `Dr. Smith's Practice ${timestamp}`,
        `50% Off Clinic ${timestamp}`,
        `Clinic (Main) ${timestamp}`,
        `Test/Clinic 1 ${timestamp}`,
      ];

      for (const name of specialNameCases) {
        const response = await request(app)
          .post("/organizations")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name })
          .expect(201);

        trackOrganization(name);

        expect(response.body.database.dbName).to.match(/^clinic_[a-z0-9_]+$/);
        expect(response.body.database.secretName).to.match(
          /^clinic-db-[a-z0-9_]+$/,
        );
      }
    });

    it("should handle very long organization names", async () => {
      const longName = "A".repeat(100) + ` Medical Center ${Date.now()}`;

      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: longName })
        .expect(201);

      trackOrganization(response.body.name);

      expect(response.body.name).to.equal(longName);
      expect(response.body.database.dbName).to.have.lengthOf.below(200);
    });
  });

  describe("Database Connectivity Tests", () => {
    it("should test database connectivity for newly created organization", async () => {
      const orgName = `Connectivity Test Clinic ${Date.now()}`;

      // Create the organization
      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: orgName })
        .expect(201);

      trackOrganization(orgName);

      const dbName = response.body.database.dbName;
      const dbUser = getOrgDbUser(orgName);

      // Get main database credentials
      const masterDbHost = process.env.DB_HOST;
      const masterDbPort = process.env.DB_PORT;
      const masterDbUser = process.env.DB_USER;
      const masterDbPassword = process.env.DB_PASSWORD;

      // Verify database exists
      const masterClient = new Client({
        host: masterDbHost,
        port: parseInt(masterDbPort || "5432"),
        user: masterDbUser,
        password: masterDbPassword,
        database: process.env.DB_NAME,
        ssl: false,
      });

      try {
        await masterClient.connect();

        // Check if database exists
        const dbExistsQuery = await masterClient.query(
          `SELECT datname FROM pg_database WHERE datname = $1`,
          [dbName],
        );

        expect(dbExistsQuery.rows).to.have.lengthOf(1);
        expect(dbExistsQuery.rows[0].datname).to.equal(dbName);

        // Check if user exists
        const userExistsQuery = await masterClient.query(
          `SELECT usename FROM pg_user WHERE usename = $1`,
          [dbUser],
        );

        expect(userExistsQuery.rows).to.have.lengthOf(1);
        expect(userExistsQuery.rows[0].usename).to.equal(dbUser);
      } finally {
        await masterClient.end();
      }

      // Verify new user can connect to the database
      const userClient = new Client({
        host: masterDbHost,
        port: parseInt(masterDbPort || "5432"),
        user: dbUser,
        password: "testpassword",
        database: dbName,
        ssl: false,
      });

      try {
        await userClient.connect();

        // Test basic query execution
        const testQuery = await userClient.query("SELECT 1 as test");
        expect(testQuery.rows).to.have.lengthOf(1);
        expect(testQuery.rows[0].test).to.equal(1);

        // Verify the user can create tables (has ownership of public schema)
        await userClient.query(`
          CREATE TABLE IF NOT EXISTS test_table (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100)
          )
        `);

        // Verify table was created
        const tableExistsQuery = await userClient.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'test_table'
        `);

        expect(tableExistsQuery.rows).to.have.lengthOf(1);

        // Test user can insert data
        await userClient.query("INSERT INTO test_table (name) VALUES ($1)", [
          "test_value",
        ]);

        // Test user can select data
        const selectQuery = await userClient.query(
          "SELECT * FROM test_table WHERE name = $1",
          ["test_value"],
        );

        expect(selectQuery.rows).to.have.lengthOf(1);
        expect(selectQuery.rows[0].name).to.equal("test_value");

        // Clean up test table
        await userClient.query("DROP TABLE IF EXISTS test_table");
      } catch (error) {
        throw new Error(
          `User connectivity test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        await userClient.end();
      }
    });

    it("should verify user permissions on newly created database", async () => {
      const orgName = `Permissions Test Clinic ${Date.now()}`;

      // Create the organization
      const response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: orgName })
        .expect(201);

      trackOrganization(orgName);

      const dbName = response.body.database.dbName;
      const dbUser = getOrgDbUser(orgName);

      // Get database credentials
      const masterDbHost = process.env.DB_HOST;
      const masterDbPort = process.env.DB_PORT;
      const masterDbUser = process.env.DB_USER;
      const masterDbPassword = process.env.DB_PASSWORD;

      const masterClient = new Client({
        host: masterDbHost,
        port: parseInt(masterDbPort || "5432"),
        user: masterDbUser,
        password: masterDbPassword,
        database: dbName,
        ssl: false,
      });

      try {
        await masterClient.connect();

        // Check user has proper privileges
        const privilegesQuery = await masterClient.query(
          `
          SELECT
            has_database_privilege($1, $2, 'CONNECT') as can_connect,
            has_database_privilege($1, $2, 'CREATE') as can_create,
            has_database_privilege($1, $2, 'TEMP') as can_temp
        `,
          [dbUser, dbName],
        );

        expect(privilegesQuery.rows[0].can_connect).to.be.true;
        expect(privilegesQuery.rows[0].can_create).to.be.true;

        // Check schema ownership
        const schemaOwnerQuery = await masterClient.query(`
          SELECT nspowner::regrole as owner
          FROM pg_namespace
          WHERE nspname = 'public'
        `);

        expect(schemaOwnerQuery.rows[0].owner).to.equal(dbUser);
      } finally {
        await masterClient.end();
      }
    });

    it("should test user isolation between databases", async () => {
      // Create two organizations
      const org1Name = `Isolation Test 1 ${Date.now()}`;
      const org1Response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: org1Name })
        .expect(201);

      trackOrganization(org1Response.body.name);

      const org2Name = `Isolation Test 2 ${Date.now()}`;
      const org2Response = await request(app)
        .post("/organizations")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: org2Name })
        .expect(201);

      trackOrganization(org2Response.body.name);

      const db2Name = org2Response.body.database.dbName;
      const user1 = getOrgDbUser(org1Name);

      const masterDbHost = process.env.DB_HOST;
      const masterDbPort = process.env.DB_PORT;

      // Test that user1 cannot access db2
      const crossClient = new Client({
        host: masterDbHost,
        port: parseInt(masterDbPort || "5432"),
        user: user1,
        password: "testpassword",
        database: db2Name,
        ssl: false,
      });

      try {
        await crossClient.connect();
        // If connection succeeds, it's a test failure
        expect.fail("User1 should not be able to connect to DB2");
      } catch (error) {
        // This is expected - user1 should not have access to db2
        expect(error).to.exist;
        if (error instanceof Error) {
          expect(error.message).to.satisfy(
            (msg: string) =>
              msg.includes("permission denied") ||
              msg.includes("authentication failed") ||
              msg.includes("password authentication failed"),
          );
        }
      } finally {
        try {
          await crossClient.end();
        } catch {
          // Ignore cleanup errors for failed connections
        }
      }
    });
  });
});
