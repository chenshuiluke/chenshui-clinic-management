CREATE TYPE "public"."appointment_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"patient_id" integer,
	"doctor_id" integer,
	"appointment_date_time" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'PENDING' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doctor_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"specialization" varchar(255) DEFAULT '' NOT NULL,
	"license_number" varchar(255) DEFAULT '' NOT NULL,
	"phone_number" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"doctor_profile_id" integer,
	"patient_profile_id" integer,
	"admin_profile_id" integer,
	"refresh_token" text,
	CONSTRAINT "organization_user_email_unique" UNIQUE("email"),
	CONSTRAINT "organization_user_doctor_profile_id_unique" UNIQUE("doctor_profile_id"),
	CONSTRAINT "organization_user_patient_profile_id_unique" UNIQUE("patient_profile_id"),
	CONSTRAINT "organization_user_admin_profile_id_unique" UNIQUE("admin_profile_id"),
	CONSTRAINT "check_only_one_role" CHECK (((patient_profile_id IS NOT NULL) AND (doctor_profile_id IS NULL) AND (admin_profile_id IS NULL)) OR ((patient_profile_id IS NULL) AND (doctor_profile_id IS NOT NULL) AND (admin_profile_id IS NULL)) OR ((patient_profile_id IS NULL) AND (doctor_profile_id IS NULL) AND (admin_profile_id IS NOT NULL)) OR ((patient_profile_id IS NULL) AND (doctor_profile_id IS NULL) AND (admin_profile_id IS NULL)))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"date_of_birth" timestamp with time zone NOT NULL,
	"phone_number" varchar(255) DEFAULT '' NOT NULL,
	"address" varchar(255),
	"emergency_contact_name" varchar(255),
	"emergency_contact_phone" varchar(255),
	"blood_type" varchar(255),
	"allergies" varchar(255),
	"chronic_conditions" varchar(255),
	"ip_address" varchar(255) DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_foreign" FOREIGN KEY ("patient_id") REFERENCES "public"."organization_user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctor_id_foreign" FOREIGN KEY ("doctor_id") REFERENCES "public"."organization_user"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_user" ADD CONSTRAINT "organization_user_doctor_profile_id_foreign" FOREIGN KEY ("doctor_profile_id") REFERENCES "public"."doctor_profile"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_user" ADD CONSTRAINT "organization_user_patient_profile_id_foreign" FOREIGN KEY ("patient_profile_id") REFERENCES "public"."patient_profile"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_user" ADD CONSTRAINT "organization_user_admin_profile_id_foreign" FOREIGN KEY ("admin_profile_id") REFERENCES "public"."admin_profile"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_doctor_id_index" ON "appointment" USING btree ("doctor_id" int4_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_patient_id_index" ON "appointment" USING btree ("patient_id" int4_ops);