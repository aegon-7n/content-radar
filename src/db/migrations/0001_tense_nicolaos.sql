-- Multi-tenancy foundation: tenants table, tenant_id on domain tables, backfill.
-- Step 1: Create tenant_role enum and tenants table
CREATE TYPE "public"."tenant_role" AS ENUM('owner', 'creator');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);--> statement-breakpoint

-- Step 2: Create billing tables (subscriptions + payments) with tenant_id from the start
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"creator_limit" integer NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"yookassa_payment_id" text,
	"type" text NOT NULL,
	"tier" text,
	"amount_kopecks" integer NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_yookassa_payment_id_unique" UNIQUE("yookassa_payment_id")
);--> statement-breakpoint

-- Step 3: Add tenant_id as NULLABLE to existing tables so backfill can run
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "tenant_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint

-- Step 4: Backfill — create default tenant, assign all existing data
INSERT INTO "tenants" ("id", "name", "slug") VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default');--> statement-breakpoint
UPDATE "users" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "creators" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "products" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "videos" SET "tenant_id" = '00000000-0000-0000-0000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint

-- Step 5: Set NOT NULL after backfill
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

-- Step 6: Add FK constraints
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Step 7: Add indexes
CREATE INDEX "idx_payments_user_id" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payments_yookassa_id" ON "payments" USING btree ("yookassa_payment_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_creators_tenant_id" ON "creators" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_products_tenant_id" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_videos_tenant_id" ON "videos" USING btree ("tenant_id");--> statement-breakpoint

-- Step 8: Waitlist UTM columns (previously defined in schema but not migrated)
ALTER TABLE "waitlist_signups" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "utm_content" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "utm_term" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "referrer" text;--> statement-breakpoint
CREATE INDEX "idx_waitlist_signups_utm_campaign" ON "waitlist_signups" USING btree ("utm_campaign");
