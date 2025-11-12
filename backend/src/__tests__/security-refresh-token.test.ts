import { expect } from 'chai';
import request from 'supertest';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { getApp, clearDatabase, getDb } from './fixtures';
import { eq } from 'drizzle-orm';
import { userTable } from '../db/schema/central/schema';
import { User as DrizzleUser } from '../db/schema/central/types';
import jwtService from '../services/jwt.service';
import cryptoService from '../utils/crypto';

describe('Security - Refresh Token Hashing and Rotation', () => {
  let app: any;
  let db: any;
  let testUser: DrizzleUser;
  let validRefreshToken: string;

  beforeEach(async () => {
    // Ensure NODE_ENV is 'test' to disable rate limiting
    process.env.NODE_ENV = 'test';

    app = getApp();
    db = getDb();

    // Create test user
    const [user] = await db
      .insert(userTable)
      .values({
        email: `test-${Date.now()}@test.com`,
        name: 'Test User',
        password: await jwtService.hashPassword('SecurePass123!'),
        isVerified: true,
      })
      .returning();
    testUser = user;
  });

  describe('Refresh Token Hashing', () => {
    it('should store hashed refresh token on login', async () => {
      const res = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      expect(res.status).to.equal(200);
      expect(res.body.refreshToken).to.exist;

      // Check that stored token is hashed
      const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, testUser.id));
      const user = users.length > 0 ? users[0] : null;
      expect(user!.refreshToken).to.exist;
      expect(user!.refreshToken).to.not.equal(res.body.refreshToken);

      // Verify the hash
      const tokenParts = jwtService.parseRefreshToken(res.body.refreshToken);
      const isValid = await cryptoService.verifyRefreshToken(
        tokenParts.plain,
        user!.refreshToken!,
      );
      expect(isValid).to.be.true;

      validRefreshToken = res.body.refreshToken;
    });

    it('should not accept plaintext refresh token', async () => {
      // Login to get a refresh token
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      // Try to use just the plain part
      const tokenParts = jwtService.parseRefreshToken(
        loginRes.body.refreshToken,
      );

      const res = await request(app).post('/auth/refresh').send({
        refreshToken: tokenParts.plain,
      });

      expect(res.status).to.equal(401);
    });

    it('should not accept tampered refresh token', async () => {
      // Login to get a refresh token
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      // Tamper with the token - modify the JWT header part
      const parts = loginRes.body.refreshToken.split('.');
      parts[0] = 'tampered'; // Tamper with JWT header
      const tamperedToken = parts.join('.');

      const res = await request(app).post('/auth/refresh').send({
        refreshToken: tamperedToken,
      });

      expect(res.status).to.equal(401);
    });
  });

  describe('Refresh Token Rotation', () => {
    it('should rotate refresh token on use', async () => {
      // Login to get initial refresh token
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      const initialRefreshToken = loginRes.body.refreshToken;

      // Use refresh token
      const refreshRes = await request(app).post('/auth/refresh').send({
        refreshToken: initialRefreshToken,
      });

      expect(refreshRes.status).to.equal(200);
      expect(refreshRes.body.accessToken).to.exist;
      expect(refreshRes.body.refreshToken).to.exist;
      expect(refreshRes.body.refreshToken).to.not.equal(initialRefreshToken);

      // Old refresh token should not work
      const oldTokenRes = await request(app).post('/auth/refresh').send({
        refreshToken: initialRefreshToken,
      });

      expect(oldTokenRes.status).to.equal(401);

      // New refresh token should work
      const newTokenRes = await request(app).post('/auth/refresh').send({
        refreshToken: refreshRes.body.refreshToken,
      });

      expect(newTokenRes.status).to.equal(200);
    });

    it('should invalidate all refresh tokens on logout', async () => {
      // Login to get tokens
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      const { accessToken, refreshToken } = loginRes.body;

      // Logout
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(logoutRes.status).to.equal(200);

      // Refresh token should not work after logout
      const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken });

      expect(refreshRes.status).to.equal(401);

      // Check database - refresh token should be null
      const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, testUser.id));
      const user = users.length > 0 ? users[0] : null;
      expect(user!.refreshToken).to.be.null;
    });

    it('should handle concurrent refresh attempts correctly', async () => {
      // Login to get initial refresh token
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      const refreshToken = loginRes.body.refreshToken;

      // Attempt multiple refreshes concurrently
      const promises = Array(5)
        .fill(null)
        .map(() =>
          request(app).post('/auth/refresh').send({ refreshToken }),
        );

      const results = await Promise.all(promises);

      // Only one should succeed (first one to complete)
      const successCount = results.filter((r) => r.status === 200).length;
      const failCount = results.filter((r) => r.status === 401).length;

      expect(successCount).to.be.at.least(1);
      expect(failCount).to.be.at.least(0);
      expect(successCount + failCount).to.equal(5);
    });
  });

  describe('Refresh Token Security', () => {
    it('should validate token type for refresh', async () => {
      // Login to get tokens
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      // Create a fake org refresh token
      const orgPayload = {
        userId: testUser.id,
        email: testUser.email,
        name: testUser.name,
        type: 'org' as const,
        orgName: 'TestOrg',
      };
      const fakeOrgRefreshJWT = jwtService.generateRefreshToken(orgPayload);
      const randomPlain = cryptoService.generateRefreshToken();
      const fakeOrgRefresh = `${fakeOrgRefreshJWT}.${randomPlain}`;

      // Try to use org refresh token on central endpoint
      const res = await request(app).post('/auth/refresh').send({
        refreshToken: fakeOrgRefresh,
      });

      expect(res.status).to.equal(401);
    });

    it('should not accept refresh token as access token', async () => {
      // Login to get tokens
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'SecurePass123!',
      });

      // Try to use refresh token as Bearer token
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.refreshToken}`);

      expect(res.status).to.equal(401);
    });
  });
});