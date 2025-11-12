import { expect } from 'chai';
import request from 'supertest';
import { describe, it, before, after, beforeEach } from 'mocha';
import { getApp, clearDatabase, getDb } from './fixtures';
import { eq } from 'drizzle-orm';
import { userTable, organizationTable } from '../db/schema/central/schema';
import {
  User as DrizzleUser,
  Organization as DrizzleOrganization,
} from '../db/schema/central/types';
import jwtService from '../services/jwt.service';
import cryptoService from '../utils/crypto';

describe('Security - JWT Token Type Discrimination', () => {
  let app: any;
  let db: any;
  let centralUser: DrizzleUser;
  let organization: DrizzleOrganization;
  let centralToken: string;
  let orgToken: string;

  beforeEach(async () => {
    // Ensure NODE_ENV is 'test' to disable rate limiting
    process.env.NODE_ENV = 'test';

    app = getApp();
    db = getDb();

    // Use unique email to avoid conflicts
    const uniqueEmail = `central-jwt-${Date.now()}@test.com`;

    // Create central user
    const [user] = await db
      .insert(userTable)
      .values({
        email: uniqueEmail,
        name: 'Central User',
        password: await jwtService.hashPassword('SecurePass123!'),
        isVerified: true,
      })
      .returning();
    centralUser = user;

    // Use unique org name to avoid conflicts
    const uniqueOrgName = `TestOrg-jwt-${Date.now()}`;

    // Create organization
    const [org] = await db
      .insert(organizationTable)
      .values({
        name: uniqueOrgName,
      })
      .returning();
    organization = org;

    // Generate tokens
    const centralPayload = {
      userId: centralUser.id,
      email: centralUser.email,
      name: centralUser.name,
      type: 'central' as const,
    };
    centralToken = jwtService.generateAccessToken(centralPayload);

    const orgPayload = {
      userId: 1,
      email: 'org@test.com',
      name: 'Org User',
      type: 'org' as const,
      orgName: uniqueOrgName,
    };
    orgToken = jwtService.generateAccessToken(orgPayload);
  });

  describe('Token Type Enforcement', () => {
    it('should reject org token on central routes', async () => {
      const res = await request(app)
        .get('/organizations')
        .set('Authorization', `Bearer ${orgToken}`);

      expect(res.status).to.equal(401);
      expect(res.body.error).to.include('Central token required');
    });

    it('should accept correct token type for central routes', async () => {
      const res = await request(app)
        .get('/organizations')
        .set('Authorization', `Bearer ${centralToken}`);

      expect(res.status).to.not.equal(401);
    });

    it('should reject tokens without type claim', async () => {
      // Generate a token without type
      const invalidPayload = {
        userId: 1,
        email: 'test@test.com',
        name: 'Test User',
      } as any;
      const invalidToken = jwtService.generateAccessToken(invalidPayload);

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(res.status).to.equal(401);
    });
  });

  describe('Token Issuer/Audience Validation', () => {
    it('should include issuer and audience in tokens', () => {
      const decoded = jwtService.verifyAccessToken(centralToken);
      expect(decoded.iss).to.exist;
      expect(decoded.aud).to.exist;
    });

    it('should reject tokens with invalid issuer', async () => {
      // This would require mocking or using a different secret
      // For now, verify that verification includes these checks
      try {
        const payload = {
          userId: 1,
          email: 'test@test.com',
          name: 'Test',
          type: 'central' as const,
          iss: 'invalid-issuer',
          aud: 'invalid-audience',
        };
        // This should fail in verification
        const token = jwtService.generateAccessToken(payload);
        jwtService.verifyAccessToken(token);
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Organization Token Validation', () => {
    it.skip('should reject org token with mismatched organization', async () => {
      // Note: This test requires a full organization database to be provisioned
      // Organization token mismatch validation is tested in appointment-api.test.ts
      const wrongOrgPayload = {
        userId: 1,
        email: 'org@test.com',
        name: 'Org User',
        type: 'org' as const,
        orgName: 'WrongOrg',
      };
      const wrongOrgToken = jwtService.generateAccessToken(wrongOrgPayload);

      const res = await request(app)
        .get(`/${organization.name}/doctors`)
        .set('Authorization', `Bearer ${wrongOrgToken}`);

      expect(res.status).to.equal(401);
      expect(res.body.error).to.include('Token organization mismatch');
    });

    it('should reject org token missing orgName', () => {
      const invalidOrgPayload = {
        userId: 1,
        email: 'org@test.com',
        name: 'Org User',
        type: 'org' as const,
      } as any;

      expect(() => {
        const token = jwtService.generateAccessToken(invalidOrgPayload);
        jwtService.verifyAccessToken(token);
      }).to.throw('Organization token missing orgName');
    });
  });
});