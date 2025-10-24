import { Request, Response } from "express";
import { RequestContext } from "@mikro-orm/core";
import OrganizationUser from "../entities/distributed/organization_user";
import { jwtService } from "../services/jwt.service";
import { OrgJWTPayload } from "../config/jwt.config";
import { OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";

export class OrgAuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: OrgLoginDto = req.body;
      const em = RequestContext.getEntityManager()!;

      const user = await em.findOne(
        OrganizationUser,
        { email },
        { populate: ["adminProfile", "doctorProfile", "patientProfile"] }
      );

      if (
        !user ||
        !(await jwtService.comparePassword(password, user.password))
      ) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const payload: OrgJWTPayload = {
        userId: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        orgName: req.organization!,
        role: user.getRole(),
      };

      const { accessToken, refreshToken } =
        jwtService.generateTokenPair(payload);

      user.refreshToken = refreshToken;
      await em.flush();

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

      let decoded;
      try {
        decoded = jwtService.verifyRefreshToken(refreshToken);
      } catch (error) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      // Validate that the token's orgName matches the current organization context
      if (!('orgName' in decoded)) {
        res.status(401).json({ error: "Invalid refresh token: organization token required" });
        return;
      }

      if (decoded.orgName !== req.organization) {
        res.status(401).json({ error: "Invalid refresh token: organization mismatch" });
        return;
      }

      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(OrganizationUser, { id: decoded.userId });

      if (!user || user.refreshToken !== refreshToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const payload: OrgJWTPayload = {
        userId: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        orgName: req.organization!,
        role: user.getRole(),
      };

      const accessToken = jwtService.generateAccessToken(payload);

      res.json({ accessToken });
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
