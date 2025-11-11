import { Request, Response } from "express";
import { RequestContext } from "@mikro-orm/core";
import OrganizationUser from "../entities/distributed/organization_user";
import jwtService from "../services/jwt.service";
import { OrgJWTPayload } from "../config/jwt.config";
import cryptoService from "../utils/crypto";
import { securityLogger } from "../utils/logger";
import { OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";

export class OrgAuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: OrgLoginDto = req.body;
      const em = RequestContext.getEntityManager()!;
      const ip = req.ip || 'unknown';

      const user = await em.findOne(
        OrganizationUser,
        { email },
        { populate: ["adminProfile", "doctorProfile", "patientProfile"] }
      );

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
      user.refreshToken = await cryptoService.hashRefreshToken(refreshTokenPlain);
      await em.flush();

      securityLogger.loginAttempt(email, true, ip);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.getRole(),
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

      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(
        OrganizationUser,
        { id: decoded.userId },
        { populate: ["adminProfile", "doctorProfile", "patientProfile"] }
      );

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
      user.refreshToken = await cryptoService.hashRefreshToken(refreshTokenPlain);
      await em.flush();

      securityLogger.tokenRefreshed(user.id, req.organization);

      res.json({
        accessToken,
        refreshToken: newRefreshToken // Return new refresh token for rotation
      });
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(OrganizationUser, {
        id: req.user!.userId,
      });

      if (user) {
        user.refreshToken = null;
        await em.flush();
      }

      securityLogger.logout(req.user!.userId, req.organization);

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(
        OrganizationUser,
        { id: req.user!.userId },
        { populate: ["adminProfile", "doctorProfile", "patientProfile"] }
      );

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.getRole(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }
}

export default new OrgAuthController();
