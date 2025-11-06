import { Router } from "express";
import orgAuthController from "../controllers/org-auth";
import { validateRequest } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { orgLoginSchema, orgRefreshTokenSchema, OrgLoginDto, OrgRefreshTokenDto } from "../validators/auth";

const router = Router();

router.post("/login", validateRequest(orgLoginSchema), (req, res) =>
  orgAuthController.login(req, res)
);

router.post("/refresh", validateRequest(orgRefreshTokenSchema), (req, res) =>
  orgAuthController.refresh(req, res)
);

router.post("/logout", authenticate, (req, res) =>
  orgAuthController.logout(req, res)
);

router.get("/me", authenticate, (req, res) => orgAuthController.me(req, res));

export default router;
