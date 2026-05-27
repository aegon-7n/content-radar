/**
 * Onboard a new paying customer tenant from the waitlist.
 *
 * Creates a tenant + owner user directly in the DB, prints login credentials.
 * Optionally marks the corresponding waitlist_signup as "onboarded".
 *
 * Usage:
 *   npx tsx scripts/onboard-tenant.ts \
 *     --email=owner@example.com \
 *     --name="Иван Иванов" \
 *     [--tenant="ИП Иванов WB"]  # defaults to name
 *
 * Output:
 *   Login URL: https://app.contentradar.app/login
 *   Email:     owner@example.com
 *   Password:  <generated>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_COST = 12;

function generatePassword(): string {
  // 16 chars from base64url — readable and strong enough for first-login
  return crypto.randomBytes(12).toString("base64url").slice(0, 16);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[а-яёa-z0-9]+/gi, (m) => {
      // Transliterate common Cyrillic chars
      const map: Record<string, string> = {
        а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",
        й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",
        у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",
        ь:"",э:"e",ю:"yu",я:"ya",
      };
      return Array.from(m).map((c) => map[c] ?? c).join("");
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function parseArgs(argv: string[]): { email: string; name: string; tenant?: string } {
  const args: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  if (!args["email"]) {
    console.error("ERROR: --email is required");
    process.exit(1);
  }
  if (!args["name"]) {
    console.error("ERROR: --name is required");
    process.exit(1);
  }
  return { email: args["email"], name: args["name"], tenant: args["tenant"] };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL not set. Copy .env.example → .env.local");
    process.exit(1);
  }

  const { email, name, tenant: tenantName } = parseArgs(process.argv);
  const resolvedTenantName = tenantName ?? name;
  const slug = slugify(resolvedTenantName) || "tenant-" + crypto.randomBytes(4).toString("hex");

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  // Check for existing user
  const [existingUser] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existingUser) {
    console.error(`ERROR: User with email "${email}" already exists. Aborting.`);
    await client.end();
    process.exit(1);
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // Ensure slug is unique
  let finalSlug = slug;
  const [slugConflict] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, slug))
    .limit(1);
  if (slugConflict) {
    finalSlug = slug + "-" + crypto.randomBytes(3).toString("hex");
  }

  try {
    await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(schema.tenants)
        .values({ name: resolvedTenantName, slug: finalSlug })
        .returning({ id: schema.tenants.id });

      await tx.insert(schema.users).values({
        tenantId: tenant.id,
        email,
        name,
        role: "owner",
        passwordHash,
      });
    });

    // Mark waitlist signup as onboarded (best-effort — no hard fail)
    const updatedRows = await db
      .update(schema.waitlistSignups)
      .set({ status: "onboarded" })
      .where(eq(schema.waitlistSignups.email, email))
      .returning({ id: schema.waitlistSignups.id });
    const updated = updatedRows.length;

    console.log("\n✓ Tenant created successfully\n");
    console.log("════════════════════════════════════════");
    console.log(" LOGIN CREDENTIALS — share with customer");
    console.log("════════════════════════════════════════");
    console.log(` URL:      https://app.contentradar.app/login`);
    console.log(` Email:    ${email}`);
    console.log(` Password: ${password}`);
    console.log(` Tenant:   ${resolvedTenantName} (${finalSlug})`);
    console.log("════════════════════════════════════════\n");

    if (updated > 0) {
      console.log(`✓ Waitlist signup for ${email} marked as "onboarded"\n`);
    } else {
      console.log(`ℹ No waitlist signup found for ${email} — status not updated\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err: Error) => {
  console.error("Onboarding failed:", err.message);
  process.exit(1);
});
