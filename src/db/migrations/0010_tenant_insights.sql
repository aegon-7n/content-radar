CREATE TABLE "tenant_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "period_start" text NOT NULL,
  "period_end" text NOT NULL,
  "patterns" jsonb NOT NULL,
  "video_count_used" integer NOT NULL,
  "gemini_cost_usd" numeric(10, 6)
);

CREATE INDEX "idx_tenant_insights_tenant_computed" ON "tenant_insights" ("tenant_id", "computed_at" DESC);
