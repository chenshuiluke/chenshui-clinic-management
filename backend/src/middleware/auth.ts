import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwt.service';
import { RequestContext } from '@mikro-orm/core';
import OrganizationUser from '../entities/distributed/organization_user';

declare global {
  namespace Express {
    interface Request {
      organizationUser?: OrganizationUser;
    }
  }
}

// Shared helper to extract, verify token and attach user to request
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
    req.user = decoded;
    return true;
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return false;
  }
};

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

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = jwtService.extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const decoded = jwtService.verifyAccessToken(token);
      req.user = decoded;
    }
    next();
  } catch (error) {
    // Token is invalid but request continues without auth
    next();
  }
};

// Helper function to authenticate and load user with specific profile
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

  // Check that EntityManager is available
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ error: 'Database context not available' });
    return null;
  }

  // Load the organization user with the requested profile
  const user = await em.findOne(
    OrganizationUser,
    { id: req.user!.userId },
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

  return user;
};

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await authenticateAndLoadProfile(req, res, 'adminProfile', 'Admin');
    if (!user) return;

    req.organizationUser = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireDoctor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await authenticateAndLoadProfile(req, res, 'doctorProfile', 'Doctor');
    if (!user) return;

    req.organizationUser = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requirePatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await authenticateAndLoadProfile(req, res, 'patientProfile', 'Patient');
    if (!user) return;

    req.organizationUser = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
