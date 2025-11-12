import { expect } from "chai";
import request from "supertest";
import { describe, it, beforeEach } from "mocha";
import { getApp, getDb } from "./fixtures";
import jwtService from "../services/jwt.service";
import { eq } from "drizzle-orm";
import { userTable } from "../db/schema/central/schema";
import { User as DrizzleUser } from "../db/schema/central/types";
import cryptoService from "../utils/crypto";

describe("Auth API", () => {
  let app: any;
  let db: any;

  beforeEach(async () => {
    app = getApp();
    db = getDb();
  });

  describe("POST /auth/register", () => {
    it("should register a new user", async () => {
      const userData = {
        email: "test@example.com",
        name: "Test User",
        password: "Password123!@#",
      };

      const response = await request(app)
        .post("/auth/register")
        .send(userData)
        .expect(201);

      expect(response.body).to.have.property(
        "message",
        "User registered successfully",
        `Expected success message but got: ${JSON.stringify(response.body)}`,
      );
      expect(
        response.body,
        `Expected user object in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("user");
      expect(
        response.body.user,
        `Expected user.id field but got: ${JSON.stringify(response.body.user)}`,
      ).to.have.property("id");
      expect(response.body.user.email).to.equal(
        userData.email,
        `Expected email "${userData.email}" but got "${response.body.user.email}"`,
      );
      expect(response.body.user.name).to.equal(
        userData.name,
        `Expected name "${userData.name}" but got "${response.body.user.name}"`,
      );
      expect(response.body.user).to.not.have.property(
        "password",
        `Password should not be returned in response but got: ${JSON.stringify(response.body.user)}`,
      );

      const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, userData.email));
      const user = users.length > 0 ? users[0] : null;
      expect(user).to.not.be.null;
      expect(
        await jwtService.comparePassword(userData.password, user!.password),
        `Password hash verification failed for user ${userData.email}`,
      ).to.be.true;
    });

    it("should reject duplicate email registration", async () => {
      const userData = {
        email: "duplicate@example.com",
        name: "First User",
        password: "Password123!@#",
      };

      await request(app).post("/auth/register").send(userData).expect(201);

      const response = await request(app)
        .post("/auth/register")
        .send({
          ...userData,
          name: "Second User",
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Email already registered",
        `Expected duplicate email error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate email format", async () => {
      const invalidEmail = "invalid-email";
      const response = await request(app)
        .post("/auth/register")
        .send({
          email: invalidEmail,
          name: "Test User",
          password: "Password123!@#",
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
        .post("/auth/register")
        .send({
          email: "test@example.com",
          name: "Test User",
          password: shortPassword,
        })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for password length ${shortPassword.length} but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("POST /auth/login", () => {
    beforeEach(async () => {
      const hashedPassword = await jwtService.hashPassword("password123");
      await db.insert(userTable).values({
        email: "login@example.com",
        name: "Login User",
        password: hashedPassword,
        isVerified: true,
      });
    });

    it("should login with valid credentials", async () => {
      const credentials = {
        email: "login@example.com",
        password: "password123",
      };

      const response = await request(app)
        .post("/auth/login")
        .send(credentials)
        .expect(200);

      expect(
        response.body,
        `Expected accessToken in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("accessToken");
      expect(
        response.body,
        `Expected refreshToken in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("refreshToken");
      expect(
        response.body,
        `Expected user object in response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("user");
      expect(response.body.user.email).to.equal(
        credentials.email,
        `Expected user email "${credentials.email}" but got "${response.body.user.email}"`,
      );
      expect(response.body.user.name).to.equal(
        "Login User",
        `Expected user name "Login User" but got "${response.body.user.name}"`,
      );

      const decoded = jwtService.verifyAccessToken(response.body.accessToken);
      expect(decoded.email).to.equal(
        credentials.email,
        `JWT payload email "${decoded.email}" doesn't match expected "${credentials.email}"`,
      );
    });

    it("should reject invalid email", async () => {
      const wrongEmail = "wrong@example.com";
      const response = await request(app)
        .post("/auth/login")
        .send({
          email: wrongEmail,
          password: "password123",
        })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid credentials",
        `Expected invalid credentials error for email "${wrongEmail}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject invalid password", async () => {
      const wrongPassword = "wrongpassword";
      const response = await request(app)
        .post("/auth/login")
        .send({
          email: "login@example.com",
          password: wrongPassword,
        })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid credentials",
        `Expected invalid credentials error for wrong password but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject unverified user", async () => {
      const hashedPassword = await jwtService.hashPassword("password123");
      await db.insert(userTable).values({
        email: "unverified@example.com",
        name: "Unverified User",
        password: hashedPassword,
        isVerified: false,
      });

      const response = await request(app)
        .post("/auth/login")
        .send({
          email: "unverified@example.com",
          password: "password123",
        })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "User not verified",
        `Expected user not verified error but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("POST /auth/refresh", () => {
    let refreshToken: string;
    let userId: number;

    beforeEach(async () => {
      const hashedPassword = await jwtService.hashPassword("password123");
      const rows = await db
        .insert(userTable)
        .values({
          email: "refresh@example.com",
          name: "Refresh User",
          password: hashedPassword,
        })
        .returning();
      const user = rows[0];
      if (!user) {
        throw new Error("User insertion failed in beforeEach");
      }

      const tokens = jwtService.generateTokenPair({
        userId: user.id,
        email: user.email,
        name: user.name,
        type: "central",
      });

      await db
        .update(userTable)
        .set({
          refreshToken: await cryptoService.hashRefreshToken(
            tokens.refreshTokenPlain,
          ),
        })
        .where(eq(userTable.id, user.id));

      userId = user.id;
      refreshToken = tokens.refreshToken;
    });

    it("should refresh access token with valid refresh token", async () => {
      const response = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      expect(
        response.body,
        `Expected accessToken in refresh response but got: ${JSON.stringify(response.body)}`,
      ).to.have.property("accessToken");

      const decoded = jwtService.verifyAccessToken(response.body.accessToken);
      expect(decoded.email).to.equal(
        "refresh@example.com",
        `Refreshed token has wrong email: expected "refresh@example.com" but got "${decoded.email}"`,
      );
    });

    it("should reject invalid refresh token", async () => {
      const invalidToken = "invalid-token";
      const response = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: invalidToken })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid refresh token",
        `Expected invalid refresh token error for token "${invalidToken}" but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject refresh token not in database", async () => {
      // Generate a token with a different userId that doesn't exist
      const nonExistentUserId = 9999;
      const newToken = jwtService.generateRefreshToken({
        userId: nonExistentUserId,
        email: "refresh@example.com",
        name: "Refresh User",
        type: "central",
      });

      const response = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: newToken })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid refresh token",
        `Expected invalid refresh token error for non-existent userId ${nonExistentUserId} but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("GET /auth/me", () => {
    let accessToken: string;

    beforeEach(async () => {
      const hashedPassword = await jwtService.hashPassword("password123");
      const rows = await db
        .insert(userTable)
        .values({
          email: "me@example.com",
          name: "Me User",
          password: hashedPassword,
        })
        .returning();
      const user = rows[0];
      if (!user) {
        throw new Error("User insertion failed in beforeEach");
      }

      accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        type: "central",
      });
    });

    it("should return current user with valid token", async () => {
      const response = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).to.have.property(
        "email",
        "me@example.com",
        `Expected user email "me@example.com" but got "${response.body.email}". Response: ${JSON.stringify(response.body)}`,
      );
      expect(response.body).to.have.property(
        "name",
        "Me User",
        `Expected user name "Me User" but got "${response.body.name}". Response: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject request without token", async () => {
      const response = await request(app).get("/auth/me").expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject request with invalid token", async () => {
      const invalidToken = "invalid-token";
      const response = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Invalid or expired token",
        `Expected invalid token error for token "${invalidToken}" but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("POST /auth/logout", () => {
    let accessToken: string;
    let userId: number;

    beforeEach(async () => {
      const hashedPassword = await jwtService.hashPassword("password123");
      const rows = await db
        .insert(userTable)
        .values({
          email: "logout@example.com",
          name: "Logout User",
          password: hashedPassword,
          refreshToken: "some-refresh-token",
        })
        .returning();
      const user = rows[0];
      if (!user) {
        throw new Error("User insertion failed in beforeEach");
      }

      userId = user.id;
      accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        type: "central",
      });
    });

    it("should logout user and clear refresh token", async () => {
      const response = await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).to.have.property(
        "message",
        "Logged out successfully",
        `Expected logout success message but got: ${JSON.stringify(response.body)}`,
      );

      const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, userId));
      const user = users[0];
      expect(user!.refreshToken).to.be.null;
    });

    it("should require authentication", async () => {
      const response = await request(app).post("/auth/logout").expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error for logout but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("POST /auth/verify", () => {
    let verifierAccessToken: string;
    let unverifiedUserId: number;

    beforeEach(async () => {
      const hashedPassword = await jwtService.hashPassword("password123");

      const result = await db.transaction(async (tx: typeof db) => {
        const verifierUserRows = await tx
          .insert(userTable)
          .values({
            email: "verifier@example.com",
            name: "Verifier User",
            password: hashedPassword,
            isVerified: true,
          })
          .returning();
        const verifierUser = verifierUserRows[0];
        if (!verifierUser) {
          throw new Error("Verifier user insertion failed in beforeEach");
        }
        const unverifiedUserRows = await tx
          .insert(userTable)
          .values({
            email: "toverify@example.com",
            name: "To Verify User",
            password: hashedPassword,
            isVerified: false,
          })
          .returning();
        const unverifiedUser = unverifiedUserRows[0];
        if (!unverifiedUser) {
          throw new Error("Unverified user insertion failed in beforeEach");
        }
        return { verifierUser, unverifiedUser };
      });

      const { verifierUser, unverifiedUser } = result;

      unverifiedUserId = unverifiedUser.id;
      verifierAccessToken = jwtService.generateAccessToken({
        userId: verifierUser.id,
        email: verifierUser.email,
        name: verifierUser.name,
        type: "central",
      });
    });

    it("should verify a user with valid userId", async () => {
      const response = await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({ userId: unverifiedUserId })
        .expect(200);

      expect(response.body).to.have.property(
        "message",
        "User verified successfully",
        `Expected success message but got: ${JSON.stringify(response.body)}`,
      );

      // Verify the user is now verified in the database
      const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, unverifiedUserId));
      const user = users[0];
      expect(user!.isVerified).to.be.true;
    });

    it("should reject verification without authentication", async () => {
      const response = await request(app)
        .post("/auth/verify")
        .send({ userId: unverifiedUserId })
        .expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject verification of non-existent user", async () => {
      const nonExistentUserId = 99999;
      const response = await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({ userId: nonExistentUserId })
        .expect(404);

      expect(response.body).to.have.property(
        "error",
        "User not found",
        `Expected user not found error for userId ${nonExistentUserId} but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should reject verification of already verified user", async () => {
      // First verify the user
      await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({ userId: unverifiedUserId })
        .expect(200);

      // Try to verify again
      const response = await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({ userId: unverifiedUserId })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "User already verified",
        `Expected user already verified error but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate userId is a positive integer", async () => {
      const response = await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({ userId: -1 })
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for negative userId but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should validate userId is required", async () => {
      const response = await request(app)
        .post("/auth/verify")
        .set("Authorization", `Bearer ${verifierAccessToken}`)
        .send({})
        .expect(400);

      expect(response.body).to.have.property(
        "error",
        "Validation failed",
        `Expected validation error for missing userId but got: ${JSON.stringify(response.body)}`,
      );
    });
  });

  describe("Protected routes", () => {
    it("should require authentication for organization routes", async () => {
      const response = await request(app).get("/organizations").expect(401);

      expect(response.body).to.have.property(
        "error",
        "Authentication token required",
        `Expected authentication required error for protected route but got: ${JSON.stringify(response.body)}`,
      );
    });

    it("should allow access with valid token", async () => {
      const rows = await db
        .insert(userTable)
        .values({
          email: "protected@example.com",
          name: "Protected User",
          password: await jwtService.hashPassword("password123"),
        })
        .returning();
      const user = rows[0];
      if (!user) {
        throw new Error("User insertion failed in test");
      }

      const accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        type: "central",
      });

      const response = await request(app)
        .get("/organizations")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).to.be.an(
        "array",
        `Expected array response for organization list but got ${typeof response.body}: ${JSON.stringify(response.body)}`,
      );
    });
  });
});
