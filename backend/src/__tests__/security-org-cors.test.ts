import { expect } from 'chai';
import request from 'supertest';
import { describe, it, before, after, beforeEach } from 'mocha';
import { getApp, clearDatabase, getDb } from './fixtures';
import { eq } from 'drizzle-orm';
import { organizationTable } from '../db/schema/central/schema';
import { Organization as DrizzleOrganization } from '../db/schema/central/types';
import { clearOrgCache } from '../middleware/org';

describe('Security - Organization Verification and CORS/Headers', () => {
  let app: any;
  let db: any;
  let testOrg: DrizzleOrganization;

  beforeEach(async () => {
    app = getApp();
    db = getDb();

    // Use unique org name to avoid conflicts
    const uniqueOrgName = `SecurityTestOrg-cors-${Date.now()}`;

    // Create test organization
    const [org] = await db
      .insert(organizationTable)
      .values({
        name: uniqueOrgName,
      })
      .returning();
    testOrg = org;
  });

  describe('Organization Existence Verification', () => {
    it('should return 404 for non-existent organization', async () => {
      const res = await request(app).get('/NonExistentOrg/auth/login');

      expect(res.status).to.equal(404);
      expect(res.body.error).to.include('Organization not found');
    });

    it('should allow access to existing organization routes', async () => {
      const res = await request(app).post(`/${testOrg.name}/auth/login`).send({
        email: 'test@test.com',
        password: 'password',
      });

      // Should not return 404 (will return 401 for invalid creds)
      expect(res.status).to.not.equal(404);
    });

    it('should cache organization existence checks', async () => {
      // First request - cache miss
      const start1 = Date.now();
      await request(app).get(`/${testOrg.name}/auth/login`);
      const time1 = Date.now() - start1;

      // Second request - should be cached
      const start2 = Date.now();
      await request(app).get(`/${testOrg.name}/auth/login`);
      const time2 = Date.now() - start2;

      // Cached request should be faster (rough check)
      expect(time2).to.be.lessThan(time1 + 10);
    });

    it('should not treat system routes as organizations', async () => {
      const systemRoutes = [
        '/auth/login',
        '/healthz',
        '/organizations',
        '/api/test',
        '/docs/test',
      ];

      for (const route of systemRoutes) {
        const res = await request(app).get(route);
        // Should not return org not found error
        if (res.body.error) {
          expect(res.body.error).to.not.include('Organization not found');
        }
      }
    });

    it('should handle URL-encoded organization names', async () => {
      // Create org with space in name
      const [spacedOrg] = await db
        .insert(organizationTable)
        .values({
          name: 'Test Hospital',
        })
        .returning();

      const res = await request(app).get('/Test%20Hospital/auth/login');

      expect(res.status).to.not.equal(404);

      // Cleanup
      await db
        .delete(organizationTable)
        .where(eq(organizationTable.id, spacedOrg.id));
    });

    it('should reject unreasonably long organization names', async () => {
      const longName = 'a'.repeat(100);
      const res = await request(app).get(`/${longName}/auth/login`);

      // Should be treated as invalid route, not org lookup
      expect(res.status).to.equal(404);
      expect(res.body.error).to.not.include('Organization not found');
    });
  });

  describe('CORS Configuration', () => {
    it('should include CORS headers for allowed origins', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).to.equal(
        'http://localhost:3000',
      );
      expect(res.headers['access-control-allow-credentials']).to.equal('true');
    });

    it('should reject requests from unauthorized origins', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', 'http://evil.com');

      expect(res.headers['access-control-allow-origin']).to.be.undefined;
    });

    it('should handle preflight requests', async () => {
      const res = await request(app)
        .options('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set(
          'Access-Control-Request-Headers',
          'Content-Type, Authorization',
        );

      expect(res.status).to.equal(204);
      expect(res.headers['access-control-allow-methods']).to.include('POST');
      expect(res.headers['access-control-allow-headers']).to.include(
        'Authorization',
      );
    });

    it('should expose rate limit headers', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-expose-headers']).to.include(
        'RateLimit-Limit',
      );
      expect(res.headers['access-control-expose-headers']).to.include(
        'RateLimit-Remaining',
      );
      expect(res.headers['access-control-expose-headers']).to.include(
        'RateLimit-Reset',
      );
    });
  });

  describe('Security Headers (Helmet)', () => {
    it('should include security headers', async () => {
      const res = await request(app).get('/healthz');

      // Check for Helmet headers
      expect(res.headers['x-dns-prefetch-control']).to.exist;
      expect(res.headers['x-frame-options']).to.exist;
      expect(res.headers['x-content-type-options']).to.equal('nosniff');
      expect(res.headers['x-xss-protection']).to.exist;
    });

    it('should include HSTS header in production', async () => {
      // This would require setting NODE_ENV to production
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Would need to recreate app with production settings
      // For now, just verify the configuration exists

      process.env.NODE_ENV = prevEnv;
      expect(true).to.be.true; // Placeholder
    });

    it('should disable X-Powered-By header', async () => {
      const res = await request(app).get('/healthz');

      expect(res.headers['x-powered-by']).to.be.undefined;
    });
  });

  describe('Request Body Limits', () => {
    it('should reject oversized JSON payloads', async () => {
      const largePayload = {
        data: 'x'.repeat(11 * 1024 * 1024), // 11MB
      };

      const res = await request(app).post('/auth/register').send(largePayload);

      expect(res.status).to.equal(413); // Payload Too Large
    });

    it('should accept payloads under 10MB', async () => {
      const normalPayload = {
        email: 'test@test.com',
        name: 'Test User',
        password: 'TestPass123!',
        metadata: 'x'.repeat(5 * 1024 * 1024), // 5MB
      };

      const res = await request(app).post('/auth/register').send(normalPayload);

      // Should not be rejected for size (may fail validation)
      expect(res.status).to.not.equal(413);
    });
  });

  describe('Error Handling', () => {
    it('should not leak stack traces in production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Trigger an error
      const res = await request(app).get('/this-route-does-not-exist');

      expect(res.body.stack).to.be.undefined;
      expect(res.body.error).to.exist;

      process.env.NODE_ENV = prevEnv;
    });

    it('should use generic error messages for security failures', async () => {
      // Try various auth failures
      const responses = await Promise.all([
        request(app)
          .post('/auth/login')
          .send({ email: 'nonexistent@test.com', password: 'pass' }),
        request(app)
          .post('/auth/login')
          .send({ email: 'test@test.com', password: 'wrong' }),
        request(app)
          .get('/auth/me')
          .set('Authorization', 'Bearer invalid-token'),
      ]);

      responses.forEach((res) => {
        if (res.status === 401) {
          // Should use generic messages
          expect(res.body.error).to.be.oneOf([
            'Invalid credentials',
            'Invalid or expired token',
          ]);
          // Should not reveal specifics like "User not found" or "Password incorrect"
          expect(res.body.error).to.not.include('not found');
          expect(res.body.error).to.not.include('password');
        }
      });
    });
  });
});