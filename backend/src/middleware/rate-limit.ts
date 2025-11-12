import rateLimit, { RateLimitRequestHandler, MemoryStore } from 'express-rate-limit';
import { Request, Response } from 'express';
import { securityLogger } from '../utils/logger';

/**
 * Extract client identifier for rate limiting.
 * For authenticated requests: IP:userId
 * For unauthenticated: IP only (since req.user not set yet)
 * For org routes: IP:org:orgName
 */

/**
 * Extract organization name from request path
 * Parses paths like "/:orgName/..." to extract the organization
 */
const extractOrgFromPath = (path: string): string | null => {
  const match = path.match(/^\/([^\/]+)(\/.*)?$/);

  // List of known system routes that should not be treated as organizations
  const systemRoutes = [
    "auth",
    "healthz",
    "organizations",
    "api",
    "unknown-route",
    "test",
    "does-not-exist",
    "swagger",
    "docs",
    "static",
    "public",
    "favicon.ico"
  ];

  if (match && match[1]) {
    const firstSegment = decodeURIComponent(match[1]);

    // Don't treat system routes as orgs
    if (systemRoutes.includes(firstSegment) ||
        firstSegment.includes(".") || // File extensions
        firstSegment.length > 50 || // Unreasonably long org names
        firstSegment.startsWith("_")) { // System prefixes
      return null;
    }

    return firstSegment;
  }

  return null;
};

/**
 * Extract client identifier for rate limiting
 * Note: req.user may not be set yet if rate limiting runs before auth middleware
 * When req.organization isn't set (because this runs before orgContext middleware),
 * we parse the org from req.path to provide org-scoped rate limiting
 */
const getClientIdentifier = (req: Request): string => {
  // Use IP address as primary identifier
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  // For authenticated requests, combine with user ID for more precise limiting
  if (req.user?.userId) {
    return `${ip}:${req.user.userId}`;
  }

  // For org routes, include org name
  // First check if org is already set by middleware
  if (req.organization) {
    return `${ip}:org:${req.organization}`;
  }

  // If not set, try to parse from path (handles case when rate limit runs before orgContext)
  const orgFromPath = extractOrgFromPath(req.path);
  if (orgFromPath) {
    return `${ip}:org:${orgFromPath}`;
  }

  return ip;
};

/**
 * Configuration objects for rate limiters
 */
const limiterConfigs = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many authentication attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false, 
    keyGenerator: (req: Request) => {
      // For login attempts, include email to separate rate limits per account
      if (req.body?.email) {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        return `${ip}:email:${req.body.email}`;
      }
      return getClientIdentifier(req);
    },
    handler: (req: Request, res: Response) => {
      const identifier = getClientIdentifier(req);
      securityLogger.rateLimitExceeded(req.path, identifier);
      res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.'
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting in test environment
      return process.env.NODE_ENV === 'test';
    },
    validate: false // Disable IPv6 validation warning
  }
};

/**
 * Strict rate limit for authentication endpoints
 * 5 attempts per 15 minutes per IP+user
 */
export let authRateLimit = rateLimit(limiterConfigs.auth);

/**
 * Moderate rate limit for registration endpoints
 * 3 attempts per hour per IP
 */
const registrationConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts
  message: 'Too many registration attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use only IP for registration to prevent blocking legitimate users
    return req.ip || req.socket?.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    securityLogger.rateLimitExceeded(req.path, ip);
    res.status(429).json({
      error: 'Too many registration attempts. Please try again later.'
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  validate: false // Disable IPv6 validation warning
};

export let registrationRateLimit = rateLimit(registrationConfig);

/**
 * General API rate limit
 * 100 requests per minute per IP+user
 */
const generalApiConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
  handler: (req: Request, res: Response) => {
    const identifier = getClientIdentifier(req);
    securityLogger.rateLimitExceeded(req.path, identifier);
    res.status(429).json({
      error: 'Too many requests. Please slow down.'
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  validate: false // Disable IPv6 validation warning
};

export let generalApiRateLimit = rateLimit(generalApiConfig);

/**
 * Strict rate limit for password reset/sensitive operations
 * 3 attempts per hour per IP
 */
const sensitiveOperationConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts
  message: 'Too many attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use only IP for sensitive operations
    return req.ip || req.socket?.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    securityLogger.rateLimitExceeded(req.path, ip);
    res.status(429).json({
      error: 'Too many attempts. Please try again later.'
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  validate: false // Disable IPv6 validation warning
};

export let sensitiveOperationRateLimit = rateLimit(sensitiveOperationConfig);

/**
 * Rate limit for refresh token endpoints
 * 10 attempts per 5 minutes
 */
const refreshTokenConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 attempts
  message: 'Too many refresh attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
  handler: (req: Request, res: Response) => {
    const identifier = getClientIdentifier(req);
    securityLogger.rateLimitExceeded(req.path, identifier);
    res.status(429).json({
      error: 'Too many refresh attempts. Please try again later.'
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  validate: false // Disable IPv6 validation warning
};

export let refreshTokenRateLimit = rateLimit(refreshTokenConfig);

/**
 * Rate limit for organization existence checks
 * Stricter limit to prevent enumeration attacks
 * 20 attempts per 5 minutes per IP
 */
const orgExistsConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 attempts
  message: 'Too many organization existence checks. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use only IP for org existence checks
    return req.ip || req.socket?.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    securityLogger.rateLimitExceeded(req.path, ip);
    res.status(429).json({
      error: 'Too many organization existence checks. Please try again later.'
    });
  },
  skip: (req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  validate: false // Disable IPv6 validation warning
};

export let orgExistsRateLimit = rateLimit(orgExistsConfig);

/**
 * Reset all rate limiters (for testing purposes)
 * Recreates all limiter instances to ensure clean state
 */
export const resetRateLimiters = async (): Promise<void> => {
  // Recreate all limiter instances to reset internal MemoryStore state
  authRateLimit = rateLimit(limiterConfigs.auth);
  registrationRateLimit = rateLimit(registrationConfig);
  generalApiRateLimit = rateLimit(generalApiConfig);
  sensitiveOperationRateLimit = rateLimit(sensitiveOperationConfig);
  refreshTokenRateLimit = rateLimit(refreshTokenConfig);
  orgExistsRateLimit = rateLimit(orgExistsConfig);
};