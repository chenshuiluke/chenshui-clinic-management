import { Request, Response } from "express";
import { OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";
import BaseController from "./base";
import authService from "../services/auth.service";

export class OrgAuthController extends BaseController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: OrgLoginDto = req.body;
      const db = this.getDb(req);
      const organizationName = req.organization!;
      const ipAddress = req.ip;

      const result = await authService.loginOrganization(
        db,
        email,
        password,
        organizationName,
        ipAddress
      );

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Invalid credentials') {
        res.status(401).json({ error: message });
        return;
      }

      if (message === 'User role not assigned') {
        res.status(403).json({ error: message });
        return;
      }

      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken }: OrgRefreshTokenDto = req.body;
      const db = this.getDb(req);
      const organizationName = req.organization!;

      const result = await authService.refreshOrganizationToken(
        db,
        refreshToken,
        organizationName
      );

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Invalid refresh token: organization token required') {
        res.status(401).json({ error: message });
        return;
      }

      if (message === 'Invalid refresh token: organization mismatch') {
        res.status(401).json({ error: message });
        return;
      }

      if (message.includes('Invalid refresh token')) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      console.error("Refresh error:", error);
      res.status(500).json({ error: "Refresh failed" });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      const userId = req.user!.userId;
      const organizationName = req.organization!;

      await authService.logoutOrganization(db, userId, organizationName);

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const db = this.getDb(req);
      const userId = req.user!.userId;

      const result = await authService.getOrganizationUser(db, userId);

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'User not found') {
        res.status(404).json({ error: message });
        return;
      }

      if (message === 'User role not assigned') {
        res.status(403).json({ error: message });
        return;
      }

      res.status(500).json({ error: "Failed to fetch user data" });
    }
  }
}

export default new OrgAuthController();
