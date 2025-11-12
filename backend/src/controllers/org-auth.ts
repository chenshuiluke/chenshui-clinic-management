import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { organizationUserTable } from "../db/schema/distributed/schema";
import { OrganizationUser } from "../db/schema/distributed/types";
import jwtService from "../services/jwt.service";
import { OrgJWTPayload } from "../config/jwt.config";
import cryptoService from "../utils/crypto";
import { securityLogger } from "../utils/logger";
import { OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";
import { getUserRole } from "../middleware/auth";
import BaseController from "./base";

export class OrgAuthController extends BaseController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: OrgLoginDto = req.body;
      const db = this.getDb(req);
      const ip = req.ip || 'unknown';

      const user = await db.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.email, email),
        with: {
          adminProfile: true,
          doctorProfile: true,
          patientProfile: true,
        },
      });

      if (!user) {
        securityLogger.loginFailed(email, `User not found in org ${req.organization}`, ip);
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const passwordValid = await jwtService.comparePassword(password, user.password);
      if (!passwordValid) {
        securityLogger.loginFailed(email, `Invalid password in org ${req.organization}`, ip);
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Check if user has a role assigned
      if (!user.adminProfile && !user.doctorProfile && !user.patientProfile) {
        res.status(403).json({ error: 'User role not assigned' });
        return;
      }

      const payload: OrgJWTPayload = {
        userId: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        type: 'org',
        orgName: req.organization!
      };

      const { accessToken, refreshToken, refreshTokenPlain } =
        jwtService.generateTokenPair(payload);

      // Hash the plain refresh token for storage
      await db.update(organizationUserTable).set({ refreshToken: await cryptoService.hashRefreshToken(refreshTokenPlain), updatedAt: new Date() }).where(eq(organizationUserTable.id, user.id));

      securityLogger.loginAttempt(email, true, ip);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: getUserRole(user),
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken }: OrgRefreshTokenDto = req.body;

      // Parse the refresh token
      let tokenParts;
      let decoded;
      try {
        tokenParts = jwtService.parseRefreshToken(refreshToken);
        decoded = jwtService.verifyRefreshToken(tokenParts.jwt);
      } catch (error) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      // Validate that it's an org token
      if (decoded.type !== 'org') {
        res.status(401).json({ error: "Invalid refresh token: organization token required" });
        return;
      }

      // Validate that the token's orgName matches the current organization context
      if (decoded.orgName !== req.organization) {
        res.status(401).json({ error: "Invalid refresh token: organization mismatch" });
        return;
      }

      const db = this.getDb(req);
      const user = await db.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.id, decoded.userId),
        with: {
          adminProfile: true,
          doctorProfile: true,
          patientProfile: true,
        },
      });

      if (!user || !user.refreshToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      // Verify the plain token against the stored hash
      const isValidToken = await cryptoService.verifyRefreshToken(
        tokenParts.plain,
        user.refreshToken
      );

      if (!isValidToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const payload: OrgJWTPayload = {
        userId: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        type: 'org',
        orgName: req.organization!
      };

      // Generate new token pair (rotation)
      const {
        accessToken,
        refreshToken: newRefreshToken,
        refreshTokenPlain
      } = jwtService.generateTokenPair(payload);

      // Update stored refresh token hash
      await db.update(organizationUserTable).set({ refreshToken: await cryptoService.hashRefreshToken(refreshTokenPlain), updatedAt: new Date() }).where(eq(organizationUserTable.id, user.id));

      securityLogger.tokenRefreshed(user.id, req.organization);

      res.json({
        accessToken,
        refreshToken: newRefreshToken // Return new refresh token for rotation
      });
    } catch (error) {
      console.error("Refresh error:", error);
      res.status(500).json({ error: "Refresh failed" });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      await db.update(organizationUserTable).set({ refreshToken: null, updatedAt: new Date() }).where(eq(organizationUserTable.id, req.user!.userId));

      securityLogger.logout(req.user!.userId, req.organization);

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      const user = await db.query.organizationUserTable.findFirst({
        where: (users, { eq }) => eq(users.id, req.user!.userId),
        with: {
          adminProfile: true,
          doctorProfile: true,
          patientProfile: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Check if user has a role assigned
      if (!user.adminProfile && !user.doctorProfile && !user.patientProfile) {
        res.status(403).json({ error: 'User role not assigned' });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: getUserRole(user),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }
}

export default new OrgAuthController();
