import { Router } from "express";
import orgAuthController from "../controllers/org-auth";
import { validateRequest } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { authRateLimit, refreshTokenRateLimit } from "../middleware/rate-limit";
import { orgLoginSchema, orgRefreshTokenSchema, OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";

const router = Router();

router.post("/login", authRateLimit, validateRequest(orgLoginSchema), (req, res) =>
  orgAuthController.login(req, res)
);

router.post("/refresh", refreshTokenRateLimit, validateRequest(orgRefreshTokenSchema), (req, res) =>
  orgAuthController.refresh(req, res)
);

router.post("/logout", authenticate, (req, res) =>
  orgAuthController.logout(req, res)
);

router.get("/me", authenticate, (req, res) => orgAuthController.me(req, res));

export default router;
