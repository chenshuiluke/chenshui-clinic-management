import { RequestContext } from "@mikro-orm/core";
import { MikroORM } from "@mikro-orm/postgresql";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

import {
  runMigrations,
  runMigrationsForDistributedDbs,
} from "./utils/migrations";
import OrganizationRouter from "./routes/organization";
import AuthRouter from "./routes/auth";
import OrgAuthRouter from "./routes/org-auth";
import DoctorRouter from "./routes/doctor";
import PatientRouter from "./routes/patient";
import AppointmentRouter from "./routes/appointment";
import { authenticate } from "./middleware/auth";
import { orgContext } from "./middleware/org";
import { generalApiRateLimit } from "./middleware/rate-limit";
import { getOrm } from "./db/centralized-db";
import { closeAllOrgConnections } from "./db/organization-db";
import Organization from "./entities/central/organization";
import logger from "./utils/logger";

export async function createApp(orm: MikroORM): Promise<express.Application> {
  const app = express();

  // Disable x-powered-by header to avoid leaking technology stack
  app.disable('x-powered-by');

  // Security headers with Helmet
  const isProduction = process.env.NODE_ENV === 'production';
  const frontendOrigin = process.env.FRONTEND_ORIGIN || (isProduction ? '' : 'http://localhost:3000');

  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline often needed for styled-components/CSS-in-JS
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", frontendOrigin].filter(Boolean),
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
        blockAllMixedContent: []
      }
    } : false, // Disable CSP in development for easier debugging
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : isDevelopment
      ? ['http://localhost:5173', 'http://frontend:5173'] // Default for development only
      : []; // Empty array in non-development if not configured

  // Throw error if no CORS origins configured in production
  if (!isDevelopment && allowedOrigins.length === 0) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be configured in non-development environments. ' +
      'Set CORS_ALLOWED_ORIGINS environment variable with comma-separated allowed origins.'
    );
  }

  app.use(cors({
    origin: (origin, callback) => {
      // In production, reject requests with no origin for security
      // In development, allow for tools like Postman
      if (!origin) {
        if (isDevelopment) {
          return callback(null, true);
        } else {
          logger.warn({ origin: 'none' }, 'CORS: Blocked request with no origin in production');
          return callback(new Error('Not allowed by CORS'));
        }
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn({ origin, allowedOrigins }, 'CORS: Blocked request from unauthorized origin');
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies if needed
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Body parser error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
  });

  // General API rate limiting
  app.use(generalApiRateLimit);

  // MikroORM RequestContext middleware for central database
  app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
  });

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

  // Organization-specific auth
  app.use("/:orgName/auth", OrgAuthRouter);
  app.use("/:orgName/doctors", DoctorRouter);
  app.use("/:orgName/patients", PatientRouter);
  app.use("/:orgName/appointments", AppointmentRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Centralized error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Log the error
    logger.error({
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name
      },
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip
      }
    }, 'Unhandled error');

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({
        error: 'Internal server error'
      });
    } else {
      res.status(500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    }
  });

  return app;
}

export async function bootstrap(port = 3000) {
  dotenv.config();

  console.log('Bootstrapping application...');
  console.log('Environment:', process.env.NODE_ENV || 'development');

  try {
    // Initialize database connection with retry logic
    console.log('Connecting to central database...');
    console.log('Database config:', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'clinic_db'
    });
    const centralOrm = await getOrm();
    console.log('Central database connection established successfully');

    // Run migrations
    console.log('Running migrations...');
    await runMigrations(centralOrm);
    console.log(`Migrations completed successfully`);

    // Setup organization databases
    console.log('Setting up organization databases...');
    const existingOrgs = await centralOrm.em.fork().find(Organization, {});
    console.log(`Found ${existingOrgs.length} existing organization(s)`);
    await runMigrationsForDistributedDbs(existingOrgs, false);
    console.log(`Organization databases ready. Initialized ${existingOrgs.length} organization database(s)`);

    // Create Express app
    console.log('Creating Express application...');
    const app = await createApp(centralOrm);
    console.log('Express application created successfully');

    process.on("SIGTERM", async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await closeAllOrgConnections();
      await centralOrm.close();
      process.exit(0);
    });

    console.log('All initialization steps completed successfully');

    return new Promise<express.Application>((resolve) => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log('Server startup complete');
        resolve(app);
      });
    });
  } catch (error) {
    console.error('Bootstrap failed:', {
      step: 'initialization',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME
      }
    });
    throw error;
  }
}
