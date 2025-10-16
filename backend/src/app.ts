import { RequestContext } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import config from "./mikro-orm.config";

export async function bootstrap(port = 3000) {
  dotenv.config();

  const orm = await MikroORM.init(config);
  const app = express();

  app.use(express.json());

  // Middleware to create request context
  app.use((req: Request, res: Response, next: NextFunction) => {
    RequestContext.create(orm.em, next);
  });

  // Shut down the connection when closing the app
  process.on("SIGTERM", async () => {
    await orm.close();
    process.exit(0);
  });

  // Simple health check route for ECS/ALB
  app.get("/healthz", (req: Request, res: Response) => {
    res.status(200).send("OK");
  });

  // Example route
  app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running 🚀" });
  });

  return new Promise<express.Application>((resolve) => {
    app.listen(port, () => {
      resolve(app);
    });
  });
}
