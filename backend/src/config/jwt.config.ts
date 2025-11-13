import { env } from "./env";

// Token type to distinguish between central and org tokens
export type TokenType = 'central' | 'org';

/**
 * Get JWT secrets dynamically based on current environment
 * This allows tests to mutate NODE_ENV after module import
 */
export const getJWTSecrets = () => ({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET ||
    (env.isTest ? 'test-access-secret' :
     env.isProduction ? undefined : 'dev-access-secret-change-in-production'),
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET ||
    (env.isTest ? 'test-refresh-secret' :
     env.isProduction ? undefined : 'dev-refresh-secret-change-in-production'),
});

/**
 * Validate JWT secrets at runtime
 * Throws error if secrets are missing in production or when not explicitly allowed
 */
export function validateSecrets(secrets: { accessTokenSecret: string | undefined; refreshTokenSecret: string | undefined }) {
  const allowInsecure = process.env.ALLOW_INSECURE_SECRETS === 'true';

  if (env.isProduction && (!secrets.accessTokenSecret || !secrets.refreshTokenSecret)) {
    throw new Error(
      'JWT secrets must be provided in production via environment variables. ' +
      'Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.'
    );
  }

  if (!env.isTest && !allowInsecure && (!secrets.accessTokenSecret || !secrets.refreshTokenSecret)) {
    throw new Error(
      'JWT secrets must be provided via environment variables. ' +
      'Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET. ' +
      'To use insecure defaults in development, set ALLOW_INSECURE_SECRETS=true (NOT recommended for production).'
    );
  }

  if (allowInsecure && !env.isTest && !env.isProduction) {
    console.warn(
      '⚠️  WARNING: Using default JWT secrets due to ALLOW_INSECURE_SECRETS=true. ' +
      'This is INSECURE and should NEVER be used in production!'
    );
  }
}

export const jwtConfig = {
  // Set to 3h for better user experience, frontend implements silent refresh before expiry
  accessTokenExpiry: '3h',
  refreshTokenExpiry: '7d',
  algorithm: 'HS512' as const,
  issuer: process.env.JWT_ISSUER || 'chenshui-clinic-management',
  audience: process.env.JWT_AUDIENCE || 'chenshui-clinic-users',
};

// Base JWT payload
export interface BaseJWTPayload {
  userId: number;
  email: string;
  name: string;
  type: TokenType;
  iss?: string;
  aud?: string;
}

// Central user JWT payload
export interface CentralJWTPayload extends BaseJWTPayload {
  type: 'central';
}

// Organization user JWT payload (no role claim - derived from DB)
export interface OrgJWTPayload extends BaseJWTPayload {
  type: 'org';
  orgName: string;
}

// Union type for all JWT payloads
export type JWTPayload = CentralJWTPayload | OrgJWTPayload;

// Decoded tokens with timestamps
export interface DecodedCentralJWT extends CentralJWTPayload {
  iat: number;
  exp: number;
}

export interface DecodedOrgJWT extends OrgJWTPayload {
  iat: number;
  exp: number;
}

// Union type for all decoded tokens
export type DecodedJWT = DecodedCentralJWT | DecodedOrgJWT;

declare global {
  namespace Express {
    interface Request {
      user?: DecodedJWT;
    }
  }
}
