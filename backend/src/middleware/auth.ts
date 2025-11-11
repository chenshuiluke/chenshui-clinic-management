import { Request, Response, NextFunction } from 'express';
import jwtService, {
  TokenTypeError,
  OrgTokenMissingNameError,
  TokenExpiredError,
  TokenInvalidError
} from '../services/jwt.service';
import { RequestContext, EntityManager } from '@mikro-orm/core';
import OrganizationUser from '../entities/distributed/organization_user';
import { DecodedOrgJWT } from '../config/jwt.config';
import logger, { securityLogger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      organizationUser?: OrganizationUser;
      em?: EntityManager;
    }
  }
}

/**
 * Extract client IP from request
 */
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
};

/**
 * Shared helper to extract, verify token and attach user to request
 */
const verifyAndAttachUser = async (
  req: Request,
  res: Response
): Promise<boolean> => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return false;
    }

    const decoded = jwtService.verifyAccessToken(token);

    // Enforce token type based on context
    if (req.organization) {
      // Organization context requires org token
      if (decoded.type !== 'org') {
        securityLogger.tokenInvalid('Central token used in org context', getClientIp(req));
        res.status(401).json({ error: 'Organization token required' });
        return false;
      }

      // Verify that the token's orgName matches the current organization context
      const orgDecoded = decoded as DecodedOrgJWT;
      if (orgDecoded.orgName !== req.organization) {
        securityLogger.orgMismatch(req.organization, orgDecoded.orgName, orgDecoded.userId);
        res.status(401).json({ error: 'Token organization mismatch' });
        return false;
      }
    } else {
      // Central context requires central token
      if (decoded.type !== 'central') {
        securityLogger.tokenInvalid('Org token used in central context', getClientIp(req));
        res.status(401).json({ error: 'Central token required' });
        return false;
      }
    }

    req.user = decoded;
    return true;
  } catch (error) {
    securityLogger.tokenInvalid(error instanceof Error ? error.message : 'Unknown error', getClientIp(req));

    // Handle specific JWT errors to preserve error messages
    if (error instanceof TokenTypeError) {
      // Check context to provide appropriate error message
      if (req.organization) {
        res.status(401).json({ error: 'Organization token required' });
      } else {
        res.status(401).json({ error: 'Central token required' });
      }
      return false;
    }

    if (error instanceof OrgTokenMissingNameError) {
      res.status(401).json({ error: 'Organization token missing orgName' });
      return false;
    }

    // For expired or invalid tokens, return generic message for security
    res.status(401).json({ error: 'Invalid or expired token' });
    return false;
  }
};

/**
 * Basic authentication middleware
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const success = await verifyAndAttachUser(req, res);
  if (success) {
    next();
  }
};

/**
 * Optional authentication middleware
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const decoded = jwtService.verifyAccessToken(token);

      // Validate token type for context
      if (req.organization && decoded.type !== 'org') {
        // Don't set user if wrong token type
        next();
        return;
      }
      if (!req.organization && decoded.type !== 'central') {
        // Don't set user if wrong token type
        next();
        return;
      }

      req.user = decoded;
    }
    next();
  } catch (error) {
    // Token is invalid but request continues without auth
    next();
  }
};

/**
 * Helper function to authenticate and load user with specific profile
 */
const authenticateAndLoadProfile = async (
  req: Request,
  res: Response,
  profileField: 'adminProfile' | 'doctorProfile' | 'patientProfile',
  roleDisplayName: string
): Promise<OrganizationUser | null> => {
  // Verify token and attach user to request
  const authenticated = await verifyAndAttachUser(req, res);
  if (!authenticated) {
    return null;
  }

  // Must be in org context for profile-based auth
  if (!req.organization || !req.user || req.user.type !== 'org') {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }

  // Check that EntityManager is available
  // Try to get from RequestContext first, then fallback to req.em
  let em = RequestContext.getEntityManager();
  const contextAvailable = !!em;
  if (!em) {
    em = req.em as EntityManager;
  }
  const reqEmAvailable = !!em && em !== RequestContext.getEntityManager();

  if (!em) {
    logger.error({
      path: req.path,
      method: req.method,
      organization: req.organization,
      hasContext: contextAvailable,
      hasReqEm: !!req.em,
      user: req.user ? { userId: req.user.userId, type: req.user.type } : null
    }, 'EntityManager retrieval failed in auth middleware');
    res.status(500).json({ error: 'Database context not available' });
    return null;
  }

  logger.debug({
    path: req.path,
    source: contextAvailable ? 'RequestContext' : 'req.em'
  }, 'EntityManager successfully retrieved');

  // Load the organization user with the requested profile
  const user = await em.findOne(
    OrganizationUser,
    { id: req.user.userId },
    { populate: [profileField] }
  );

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }

  if (!user[profileField]) {
    res.status(403).json({ error: `${roleDisplayName} access required` });
    return null;
  }

  // Validate that the user's actual role matches what they're trying to access
  // This prevents stale tokens from accessing wrong roles
  const actualRole = user.getRole();
  const expectedRole = profileField.replace('Profile', '').toUpperCase();

  if (actualRole !== expectedRole) {
    securityLogger.suspiciousActivity(
      'ROLE_MISMATCH',
      {
        userId: user.id,
        actualRole,
        expectedRole,
        orgName: req.organization
      },
      getClientIp(req)
    );
    res.status(403).json({ error: 'Role verification failed' });
    return null;
  }

  return user;
};

/**
 * Require admin role
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await authenticateAndLoadProfile(req, res, 'adminProfile', 'Admin');
  if (!user) return; // Response already sent by authenticateAndLoadProfile

  req.organizationUser = user;
  next();
};

/**
 * Require doctor role
 */
export const requireDoctor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await authenticateAndLoadProfile(req, res, 'doctorProfile', 'Doctor');
  if (!user) return; // Response already sent by authenticateAndLoadProfile

  req.organizationUser = user;
  next();
};

/**
 * Require patient role
 */
export const requirePatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await authenticateAndLoadProfile(req, res, 'patientProfile', 'Patient');
  if (!user) return; // Response already sent by authenticateAndLoadProfile

  req.organizationUser = user;
  next();
};

/**
 * Middleware to reject requests with Authorization headers on open endpoints
 * This prevents confusion and potential side-effects from using wrong token types
 */
export const rejectAuthOnOpenEndpoint = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.headers.authorization) {
    securityLogger.suspiciousActivity(
      'AUTH_ON_OPEN_ENDPOINT',
      {
        path: req.path,
        method: req.method,
        organization: req.organization
      },
      getClientIp(req)
    );
    res.status(400).json({
      error: 'This endpoint does not accept authentication. Remove the Authorization header.'
    });
    return;
  }
  next();
};