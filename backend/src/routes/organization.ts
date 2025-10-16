import { Router } from "express";
import OrganizationController from "../controllers/organization";
import { validateRequest } from "../middleware/validator";
import { createOrganizationResponseSchema } from "../validators/organization";

const router = Router();
const organizationController = new OrganizationController();

router.route("/").get(organizationController.getAllOrganizations);
router
  .route("/")
  .post(
    validateRequest(createOrganizationResponseSchema),
    organizationController.create,
  );
export default router;
