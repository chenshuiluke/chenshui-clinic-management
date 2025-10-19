import { expect } from "chai";
import request from "supertest";
import { describe, it, beforeEach } from "mocha";
import { getApp, getOrm } from "./fixtures";
import { jwtService } from "../services/jwt.service";
import User from "../entities/central/user";

describe("Auth API", () => {
  let app: any;
  let orm: any;

  beforeEach(async () => {
    app = getApp();
    orm = getOrm();
  });

  describe("POST /auth/register", () => {
    it("should register a new user", async () => {
      const userData = {
        email: "test@example.com",
        name: "Test User",
        password: "password123",
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

      const em = orm.em.fork();
      const user = await em.findOne(User, { email: userData.email });
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
        password: "password123",
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
          password: "password123",
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
      const em = orm.em.fork();
      const hashedPassword = await jwtService.hashPassword("password123");
      const user = em.create(User, {
        email: "login@example.com",
        name: "Login User",
        password: hashedPassword,
      });
      await em.persistAndFlush(user);
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
  });

  describe("POST /auth/refresh", () => {
    let refreshToken: string;
    let userId: number;

    beforeEach(async () => {
      const em = orm.em.fork();
      const hashedPassword = await jwtService.hashPassword("password123");
      const user = em.create(User, {
        email: "refresh@example.com",
        name: "Refresh User",
        password: hashedPassword,
      });

      await em.persistAndFlush(user);

      const tokens = jwtService.generateTokenPair({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      user.refreshToken = tokens.refreshToken;
      await em.flush();

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
      const em = orm.em.fork();
      const hashedPassword = await jwtService.hashPassword("password123");
      const user = em.create(User, {
        email: "me@example.com",
        name: "Me User",
        password: hashedPassword,
      });
      await em.persistAndFlush(user);

      accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
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
      const em = orm.em.fork();
      const hashedPassword = await jwtService.hashPassword("password123");
      const user = em.create(User, {
        email: "logout@example.com",
        name: "Logout User",
        password: hashedPassword,
        refreshToken: "some-refresh-token",
      });
      await em.persistAndFlush(user);

      userId = user.id;
      accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
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

      const em = orm.em.fork();
      const user = await em.findOne(User, { id: userId });
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
      const em = orm.em.fork();
      const user = em.create(User, {
        email: "protected@example.com",
        name: "Protected User",
        password: await jwtService.hashPassword("password123"),
      });
      await em.persistAndFlush(user);

      const accessToken = jwtService.generateAccessToken({
        userId: user.id,
        email: user.email,
        name: user.name,
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
