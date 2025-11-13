import { Request, Response } from "express";
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  VerifyUserDto,
} from "../validators/auth";
import BaseController from "./base";
import authService from "../services/auth.service";

export class AuthController extends BaseController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: LoginDto = req.body;
      const db = this.getCentralDb(req);
      const ipAddress = req.ip;

      const result = await authService.loginCentral(db, email, password, ipAddress);

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Invalid credentials' || message === 'User not verified') {
        res.status(401).json({ error: message });
        return;
      }

      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, password }: RegisterDto = req.body;
      const db = this.getCentralDb(req);

      const result = await authService.registerCentral(db, email, name, password);

      res.status(201).json({
        message: "User registered successfully",
        user: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('already exists')) {
        const errorMsg = message.includes('email') ? "Email already registered" : "Name already registered";
        res.status(400).json({ error: errorMsg });
        return;
      }

      res.status(500).json({ error: "Registration failed" });
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken }: RefreshTokenDto = req.body;

      if (!refreshToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const db = this.getCentralDb(req);
      const result = await authService.refreshCentralToken(db, refreshToken);

      res.json(result);
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getCentralDb(req);
      const userId = req.user!.userId;

      const result = await authService.getCentralUser(db, userId);

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'User not found') {
        res.status(404).json({ error: message });
        return;
      }

      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getCentralDb(req);
      const userId = req.user!.userId;

      await authService.logoutCentral(db, userId);

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
      const db = this.getCentralDb(req);
      const verifierId = req.user?.userId;

      if (!verifierId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const ipAddress = req.ip;
      const result = await authService.verifyCentralUser(db, userId, verifierId, ipAddress);

      // TODO: Send notification to user about verification
      // TODO: Log this action for audit compliance

      res.json({
        message: "User verified successfully",
        verifiedBy: verifierId,
        timestamp: result.verifiedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Cannot verify yourself') {
        res.status(403).json({ error: "Cannot verify your own account" });
        return;
      }

      if (message === 'User not found') {
        res.status(404).json({ error: message });
        return;
      }

      if (message === 'User already verified') {
        res.status(400).json({ error: message });
        return;
      }

      console.error("Verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  }
}

export default new AuthController();
