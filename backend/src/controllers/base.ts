import { EntityManager } from "@mikro-orm/postgresql";
import { RequestContext } from "@mikro-orm/core";

export default abstract class BaseController {
  protected get em(): EntityManager {
    const em = RequestContext.getEntityManager() as EntityManager;
    if (!em) {
      throw new Error("EntityManager not available in RequestContext");
    }
    return em;
  }
}
