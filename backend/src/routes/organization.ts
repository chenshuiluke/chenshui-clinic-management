import { Router, Request, Response, NextFunction } from "express";
import OrganizationController from "../controllers/organization";
import { validateRequest } from "../middleware/validator";
import { createOrganizationSchema } from "../validators/organization";

const router = Router();
const organizationController = new OrganizationController();
router
  .route("/")
  .get((req, res) => organizationController.getAllOrganizations(req, res));
router
  .route("/")
  .post(validateRequest(createOrganizationSchema), (req, res) =>
    organizationController.create(req, res),
  );
export default router;
