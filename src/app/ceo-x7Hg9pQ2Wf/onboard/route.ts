import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tenants, users, waitlistSignups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { sendWelcomeEmail } from "@/lib/email/welcome";

// Middleware already verifies Basic Auth for all /ceo-* paths.

const Schema = z.object({
  waitlistId: z.number().int().positive(),
  tenantName: z.string().min(1).max(200),
  adminEmail: z.string().email().max(254),
  adminName: z.string().min(1).max(200),
});

function generatePassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tenant";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { waitlistId, tenantName, adminEmail, adminName } = parsed.data;

  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existingUser.length > 0) {
    return NextResponse.json({ ok: false, error: "Email уже зарегистрирован в системе" }, { status: 409 });
  }

  const password = generatePassword();
  const passwordHash = await hash(password, 12);

  const baseSlug = slugify(tenantName);
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    slug = `${baseSlug}-${suffix++}`;
  }

  const [tenant] = await db.insert(tenants).values({ name: tenantName, slug }).returning();

  await db.insert(users).values({
    tenantId: tenant.id,
    email: adminEmail,
    name: adminName,
    role: "owner",
    passwordHash,
  });

  await db
    .update(waitlistSignups)
    .set({ status: "in_cohort" })
    .where(eq(waitlistSignups.id, waitlistId));

  const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://contentradar.app"}/login`;

  // No-ops when RESEND_API_KEY is absent — fires automatically once key is set (TRU-55).
  void sendWelcomeEmail({ email: adminEmail, firstName: adminName.split(" ")[0] ?? adminName });

  return NextResponse.json({ ok: true, email: adminEmail, password, loginUrl, tenantSlug: slug });
}
