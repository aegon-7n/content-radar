import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const RegisterSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(1, "Имя обязательно"),
  companyName: z.string().min(1, "Название компании обязательно"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

export async function POST(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env.REGISTER_SECRET;
  if (!secret || bearer !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { email, name, companyName } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже существует" },
      { status: 409 },
    );
  }

  const slug = slugify(companyName) || `tenant-${Date.now()}`;

  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: companyName, slug })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email,
        name,
        role: "owner",
      })
      .returning();

    return { tenant, user };
  });

  return NextResponse.json(
    {
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
    },
    { status: 201 },
  );
}
