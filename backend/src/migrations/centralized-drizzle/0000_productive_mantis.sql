CREATE TABLE IF NOT EXISTS "organization" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" varchar(255) NOT NULL,
	CONSTRAINT "organization_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"refresh_token" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_name_unique" UNIQUE("name")
);
