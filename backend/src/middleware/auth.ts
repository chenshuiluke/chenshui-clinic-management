import { Request, Response, NextFunction } from 'express';
import jwtService, {
  TokenTypeError,
  OrgTokenMissingNameError,
  TokenExpiredError,
  TokenInvalidError
} from '../services/jwt.service';
import { DecodedOrgJWT } from '../config/jwt.config';
import logger, { securityLogger } from '../utils/logger';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {
  organizationUserTable,
  adminProfileTable,
  doctorProfileTable,
  patientProfileTable
} from '../db/schema/distributed/schema';
import * as distributedSchema from '../db/schema/distributed/schema';
import * as distributedRelations from '../db/schema/distributed/relations';

// Type for organization user with profile information
export type OrganizationUserWithProfile = {
  id: number;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  refreshToken: string | null;
  doctorProfileId: number | null;
  patientProfileId: number | null;
  adminProfileId: number | null;
  adminProfile?: typeof adminProfileTable.$inferSelect | null;
  doctorProfile?: typeof doctorProfileTable.$inferSelect | null;
  patientProfile?: typeof patientProfileTable.$inferSelect | null;
};

// Helper to get role from user
export function getUserRole(user: OrganizationUserWithProfile): 'ADMIN' | 'DOCTOR' | 'PATIENT' {
  if (user.adminProfile) return 'ADMIN';
  if (user.doctorProfile) return 'DOCTOR';
  if (user.patientProfile) return 'PATIENT';
  throw new Error('User must have exactly one profile (admin, doctor, or patient).');
}

type Db = NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;

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
): Promise<OrganizationUserWithProfile | null> => {
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

  // Check that database is available
  if (!req.db) {
    logger.error({
      path: req.path,
      method: req.method,
      organization: req.organization,
      user: req.user ? { userId: req.user.userId, type: req.user.type } : null
    }, 'Database not available in auth middleware');
    res.status(500).json({ error: 'Database context not available' });
    return null;
  }

  const db = req.db;

  // Load the organization user with all profile joins
  const results = await db
    .select()
    .from(organizationUserTable)
    .leftJoin(adminProfileTable, eq(organizationUserTable.adminProfileId, adminProfileTable.id))
    .leftJoin(doctorProfileTable, eq(organizationUserTable.doctorProfileId, doctorProfileTable.id))
    .leftJoin(patientProfileTable, eq(organizationUserTable.patientProfileId, patientProfileTable.id))
    .where(eq(organizationUserTable.id, req.user.userId))
    .limit(1);

  if (results.length === 0) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }

  const result = results[0];
  if (!result) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }

  const user: OrganizationUserWithProfile = {
    id: result.organization_user.id,
    email: result.organization_user.email,
    password: result.organization_user.password,
    firstName: result.organization_user.firstName,
    lastName: result.organization_user.lastName,
    refreshToken: result.organization_user.refreshToken,
    doctorProfileId: result.organization_user.doctorProfileId,
    patientProfileId: result.organization_user.patientProfileId,
    adminProfileId: result.organization_user.adminProfileId,
    adminProfile: result.admin_profile,
    doctorProfile: result.doctor_profile,
    patientProfile: result.patient_profile,
  };

  if (!user[profileField]) {
    res.status(403).json({ error: `${roleDisplayName} access required` });
    return null;
  }

  // Validate that the user's actual role matches what they're trying to access
  // This prevents stale tokens from accessing wrong roles
  const actualRole = getUserRole(user);
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