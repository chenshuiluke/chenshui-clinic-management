import { Router } from "express";
import authController from "../controllers/auth";
import { validateRequest } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  verifyUserSchema,
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  VerifyUserDto,
} from "../validators/auth";

const router = Router();

router.post("/login", validateRequest(loginSchema), (req, res) =>
  authController.login(req, res),
);

router.post("/register", validateRequest(registerSchema), (req, res) =>
  authController.register(req, res),
);

router.post("/refresh", validateRequest(refreshTokenSchema), (req, res) =>
  authController.refreshToken(req, res),
);

router.get("/me", authenticate, (req, res) => authController.me(req, res));

router.post("/logout", authenticate, (req, res) =>
  authController.logout(req, res),
);

router.post("/verify", authenticate, validateRequest(verifyUserSchema), (req, res) =>
  authController.verify(req, res),
);

export default router;
