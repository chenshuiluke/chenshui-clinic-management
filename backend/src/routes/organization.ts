import { Router } from "express";
import { OrganizationController } from "../controllers";

const router = Router();
router.route("/").get(OrganizationController.getAllOrganizations);

export default router;
