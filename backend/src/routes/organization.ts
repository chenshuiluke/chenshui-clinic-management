import { Router, Request, Response, NextFunction } from "express";
import OrganizationController from "../controllers/organization";
import { validateRequest, validate } from "../middleware/validator";
import {
  createOrganizationSchema,
  createAdminUserSchema,
  orgIdParamSchema,
  orgNameParamSchema,
  CreateOrganizationDto,
  CreateAdminUserDto,
  OrgIdParam,
  OrgNameParam,
} from "../validators/organization";

const router = Router();
const organizationController = new OrganizationController();
router
  .route("/count")
  .get((req, res) => organizationController.getOrganizationsCount(req, res));
router
  .route("/")
  .get((req, res) => organizationController.getAllOrganizations(req, res));
router
  .route("/")
  .post(validateRequest(createOrganizationSchema), (req, res) =>
    organizationController.create(req, res),
  );
router
  .route("/:orgId/users")
  .post(validate(orgIdParamSchema, 'params'), validateRequest(createAdminUserSchema), (req, res) =>
    organizationController.createAdminUser(req, res),
  );
export default router;
