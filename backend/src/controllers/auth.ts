import { Request, Response } from "express";
import { RequestContext } from "@mikro-orm/core";
import User from "../entities/central/user";
import jwtService from "../services/jwt.service";
import { CentralJWTPayload } from "../config/jwt.config";
import cryptoService from "../utils/crypto";
import { securityLogger } from "../utils/logger";
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  VerifyUserDto,
} from "../validators/auth";

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: LoginDto = req.body;
      const em = RequestContext.getEntityManager()!;
      const ip = req.ip || 'unknown';

      const user = await em.findOne(User, { email });

      if (!user) {
        securityLogger.loginFailed(email, 'User not found', ip);
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const passwordValid = await jwtService.comparePassword(password, user.password);
      if (!passwordValid) {
        securityLogger.loginFailed(email, 'Invalid password', ip);
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      if (user.isVerified === false) {
        securityLogger.loginFailed(email, 'User not verified', ip);
        res.status(401).json({ error: "User not verified" });
        return;
      }

      const payload: CentralJWTPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        type: 'central'
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
          name: user.name,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, password }: RegisterDto = req.body;
      const em = RequestContext.getEntityManager()!;

      const existingUser = await em.findOne(User, { email });
      if (existingUser) {
        res.status(400).json({ error: "Email already registered" });
        return;
      }

      const hashedPassword = await jwtService.hashPassword(password);

      const user = em.create(User, {
        email,
        name,
        password: hashedPassword,
        isVerified: false,
      });

      await em.persistAndFlush(user);

      res.status(201).json({
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken }: RefreshTokenDto = req.body;

      // Check if refreshToken is provided
      if (!refreshToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

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

      // Ensure it's a central token
      if (decoded.type !== 'central') {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(User, { id: decoded.userId });

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

      const payload: CentralJWTPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        type: 'central'
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

      securityLogger.tokenRefreshed(user.id);

      res.json({
        accessToken,
        refreshToken: newRefreshToken // Return new refresh token for rotation
      });
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(User, { id: req.user!.userId });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(User, { id: req.user!.userId });

      if (user) {
        user.refreshToken = null;
        await em.flush();
      }

      securityLogger.logout(req.user!.userId);

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }

  /**
   * Verify a user account
   *
   * SECURITY: This is a sensitive operation that grants account access.
   * Current implementation requires:
   * - Authenticated admin (via authenticate middleware)
   * - Rate limiting (via sensitiveOperationRateLimit)
   * - Users cannot verify themselves
   *
   * TODO: Consider implementing multi-admin approval workflow:
   * - Require approval from 2+ admins
   * - Implement verification request entity with approval tracking
   * - Add email/Slack notifications for verification requests
   * - Support time-bound approval requests that expire
   * - Audit trail of all approval/rejection actions
   */
  async verify(req: Request, res: Response): Promise<void> {
    try {
      const { userId }: VerifyUserDto = req.body;
      const em = RequestContext.getEntityManager()!;
      const verifierId = req.user?.userId;

      if (!verifierId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Prevent users from verifying themselves
      if (userId === verifierId) {
        securityLogger.suspiciousActivity(
          'SELF_VERIFICATION_ATTEMPT',
          { userId, verifierId },
          req.ip || 'unknown'
        );
        res.status(403).json({ error: "Cannot verify your own account" });
        return;
      }

      const user = await em.findOne(User, { id: userId });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.isVerified) {
        res.status(400).json({ error: "User already verified" });
        return;
      }

      user.isVerified = true;
      await em.flush();

      securityLogger.userVerified(userId, verifierId);

      // TODO: Send notification to user about verification
      // TODO: Log this action for audit compliance

      res.json({
        message: "User verified successfully",
        verifiedBy: verifierId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  }
}

export default new AuthController();
