/**
 * Idempotent QA smoke account seed.
 *
 * Creates (or updates) a dedicated QA tenant + user for Playwright CI.
 * Prints credentials to stdout on every run — capture and store in
 * GitHub Secrets (QA_SMOKE_EMAIL, QA_SMOKE_PASSWORD).
 *
 * Usage:
 *   npx tsx scripts/seed-qa-smoke-tenant.ts
 *
 * Password resolution order:
 *   1. QA_SMOKE_PASSWORD env var (stable for repeated CI runs)
 *   2. Auto-generated 32-char random (first-time setup)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const QA_EMAIL = "qa-smoke@contentradar.app";
const QA_NAME = "QA Smoke";
const QA_TENANT_SLUG = "qa-smoke";
const QA_TENANT_NAME = "QA Smoke Tenant";
const BCRYPT_COST = 12;

function generatePassword(): string {
  return crypto.randomBytes(24).toString("base64url").slice(0, 32);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is not set. Copy .env.example to .env.local and fill in the value.");
    process.exit(1);
  }

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  const password = process.env.QA_SMOKE_PASSWORD ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    // Check if user already exists
    const [existing] = await db
      .select({ id: schema.users.id, tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(eq(schema.users.email, QA_EMAIL))
      .limit(1);

    if (existing) {
      // Idempotent: update password only
      await db
        .update(schema.users)
        .set({ passwordHash })
        .where(eq(schema.users.email, QA_EMAIL));

      console.log("QA smoke account updated (password rotated).");
    } else {
      // Create tenant + user in a transaction
      await db.transaction(async (tx) => {
        // Tenant may exist without the user (edge case) — upsert by slug
        const [existingTenant] = await tx
          .select({ id: schema.tenants.id })
          .from(schema.tenants)
          .where(eq(schema.tenants.slug, QA_TENANT_SLUG))
          .limit(1);

        const tenant = existingTenant
          ? existingTenant
          : (
              await tx
                .insert(schema.tenants)
                .values({ name: QA_TENANT_NAME, slug: QA_TENANT_SLUG })
                .returning({ id: schema.tenants.id })
            )[0];

        await tx.insert(schema.users).values({
          tenantId: tenant.id,
          email: QA_EMAIL,
          name: QA_NAME,
          role: "owner", // owner = normal self-serve user, NOT the ADMIN_EMAIL backdoor
          passwordHash,
        });
      });

      console.log("QA smoke account created.");
    }

    console.log("");
    console.log("=== QA SMOKE CREDENTIALS ===");
    console.log(`QA_SMOKE_EMAIL=${QA_EMAIL}`);
    console.log(`QA_SMOKE_PASSWORD=${password}`);
    console.log("============================");
    console.log("");
    console.log("Store these in GitHub Secrets and .env.local for Playwright CI.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
