import { Request, Response, NextFunction } from "express";
import { RequestContext } from "@mikro-orm/core";
import { getOrgOrm } from "../db/organization-db";
import centralizedOrm from "../db/centralized-db";

declare global {
  namespace Express {
    interface Request {
      organization?: string;
    }
  }
}

/**
 * Extract organization from URL path and set appropriate ORM context
 */
export async function orgContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Check if path starts with an organization name
    const match = req.path.match(/^\/([^\/]+)(\/.*)?$/);

    if (
      match &&
      match[1] &&
      !["auth", "healthz", "organizations"].includes(match[1])
    ) {
      // This is an organization-specific request
      const orgName = match[1];
      req.organization = orgName;

      const orgOrm = await getOrgOrm(orgName);
      RequestContext.create(orgOrm.em, next);
    } else {
      // Use central ORM for non-organization requests
      RequestContext.create(centralizedOrm.em, next);
    }
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid organization",
    });
  }
}
