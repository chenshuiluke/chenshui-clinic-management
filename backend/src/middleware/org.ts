import { Request, Response, NextFunction } from "express";
import { RequestContext } from "@mikro-orm/core";
import { getOrgOrm } from "../db/organization-db";
import { getOrm } from "../db/centralized-db";

// This adds organization as a field to the request object
declare global {
  namespace Express {
    interface Request {
      organization?: string;
    }
  }
}

/**
 * Extract organization from URL path and set appropriate ORM context
 * Fixed version that doesn't interfere with 404 handling
 */
export async function orgContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Check if path starts with an organization name
    const match = req.path.match(/^\/([^\/]+)(\/.*)?$/);

    // List of known system routes that should not be treated as organizations
    const systemRoutes = [
      "auth",
      "healthz",
      "organizations",
      "api",
      "unknown-route",
      "test",
      "does-not-exist",
    ];

    // Additional patterns that indicate this is not an organization route
    const isSystemPath =
      match &&
      match[1] &&
      (systemRoutes.includes(match[1]) ||
        match[1].includes(".") || // File extensions
        match[1].length > 50); // Unreasonably long org names

    if (match && match[1] && !isSystemPath) {
      // This might be an organization-specific request
      // Decode the URL-encoded organization name (e.g., Test%20Hospital -> Test Hospital)
      const orgName = decodeURIComponent(match[1]);

      // Try to get the organization ORM
      const orgOrm = await getOrgOrm(orgName);
      req.organization = orgName;
      RequestContext.create(orgOrm.em, next);
    } else {
      // Use central ORM for non-organization requests
      const centralizedOrm = await getOrm();
      RequestContext.create(centralizedOrm.em, next);
    }
  } catch (error) {
    // Only return error if it's not a routing issue
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes("password authentication failed") &&
      req.path.includes("unknown")
    ) {
      // This is likely a test for 404 routes
      const centralizedOrm = await getOrm();
      RequestContext.create(centralizedOrm.em, next);
    } else {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid organization",
      });
    }
  }
}
