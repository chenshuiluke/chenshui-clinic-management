import { RequestContext } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import config from "./mikro-orm.config";
import { runMigrations } from "./utils/runMigrations";
import OrganizationRouter from "./routes/organization";
import AuthRouter from "./routes/auth";
import { authenticate } from "./middleware/auth.middleware";

/**
 * Create and configure Express app without starting the server
 */
export async function createApp(orm: MikroORM): Promise<express.Application> {
  const app = express();

  app.use(express.json());

  // Middleware to create request context
  app.use((req: Request, res: Response, next: NextFunction) => {
    RequestContext.create(orm.em, next);
  });

  // Simple health check route for ECS/ALB
  app.get("/healthz", (req: Request, res: Response) => {
    res.status(200).send("OK");
  });

  app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running" });
  });

  // Auth routes (public)
  app.use("/auth", AuthRouter);

  // Protected routes
  app.use("/organization", authenticate, OrganizationRouter);

  return app;
}

/**
 * Bootstrap the application with database and server
 */
export async function bootstrap(port = 3000) {
  dotenv.config();

  const orm = await MikroORM.init(config);

  // Run migrations before starting the server
  await runMigrations(orm);

  const app = await createApp(orm);

  // Shut down the connection when closing the app
  process.on("SIGTERM", async () => {
    await orm.close();
    process.exit(0);
  });

  return new Promise<express.Application>((resolve) => {
    app.listen(port, () => {
      resolve(app);
    });
  });
}
