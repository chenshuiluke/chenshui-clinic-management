import { Request, Response } from "express";
import { RequestContext } from "@mikro-orm/core";
import User from "../entities/central/user.entity";
import { jwtService } from "../services/jwt.service";
import { JWTPayload } from "../config/jwt.config";
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
} from "../validators/auth.validator";

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password }: LoginDto = req.body;
      const em = RequestContext.getEntityManager()!;

      const user = await em.findOne(User, { email });

      if (
        !user ||
        !(await jwtService.comparePassword(password, user.password))
      ) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
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

      let decoded;
      try {
        decoded = jwtService.verifyRefreshToken(refreshToken);
      } catch (error) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const em = RequestContext.getEntityManager()!;
      const user = await em.findOne(User, { id: decoded.userId });

      if (!user || user.refreshToken !== refreshToken) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
      };

      const accessToken = jwtService.generateAccessToken(payload);

      res.json({ accessToken });
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

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }
}

export default new AuthController();
