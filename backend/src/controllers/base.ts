import { EntityManager } from "@mikro-orm/postgresql";
import { RequestContext } from "@mikro-orm/core";
import { Request } from "express";

export default abstract class BaseController {
  protected get em(): EntityManager {
    // Try to get from RequestContext first
    let em = RequestContext.getEntityManager() as EntityManager;

    if (!em) {
      throw new Error("EntityManager not available in RequestContext");
    }
    return em;
  }

  /**
   * Get EntityManager with fallback to request object
   * This method should be used in controller methods that have access to the request
   */
  protected getEm(req: Request): EntityManager {
    // Try to get from RequestContext first
    let em = RequestContext.getEntityManager() as EntityManager;

    // Fallback to req.em if RequestContext doesn't have it
    if (!em && req.em) {
      em = req.em as EntityManager;
    }

    if (!em) {
      throw new Error("EntityManager not available in RequestContext or Request object");
    }
    return em;
  }
}
