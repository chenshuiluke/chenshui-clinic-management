import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateRequest(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          issues: error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }

      return res.status(500).json({
        error: "Internal server error",
      });
    }
  };
}

// For validating params, query, and body separately
export function validate(
  schema: ZodSchema,
  source: "body" | "params" | "query" = "body",
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req[source]);

      // For query and params, we need to redefine the property since they're read-only getters
      if (source === "query" || source === "params") {
        Object.defineProperty(req, source, {
          value: validated,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        req[source] = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.flatten(),
        });
      }
      next(error);
    }
  };
}
