import { RequestContext } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

import { runMigrations } from "./utils/runMigrations";
import OrganizationRouter from "./routes/organization";
import AuthRouter from "./routes/auth";
import { authenticate } from "./middleware/auth";
import { orgContext } from "./middleware/org";
import { getOrm } from "./db/centralized-db";
import { closeAllOrgConnections } from "./db/organization-db";

export async function createApp(orm: MikroORM): Promise<express.Application> {
  const app = express();

  app.use(express.json());

  // Apply organization context middleware
  app.use(orgContext);

  // Central routes
  app.get("/healthz", (req: Request, res: Response) => {
    res.status(200).send("OK");
  });

  app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running" });
  });

  // Central auth
  app.use("/auth", AuthRouter);
  app.use("/organizations", authenticate, OrganizationRouter);

  return app;
}

export async function bootstrap(port = 3000) {
  dotenv.config();
  const orm = await getOrm();
  await runMigrations(orm);

  const app = await createApp(orm);

  process.on("SIGTERM", async () => {
    await closeAllOrgConnections();
    await orm.close();
    process.exit(0);
  });

  return new Promise<express.Application>((resolve) => {
    app.listen(port, () => {
      resolve(app);
    });
  });
}
