import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuthWithTenant } from "@/lib/tenant";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "Минимум 6 символов"),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Неверные данные" },
      { status: 400 }
    );
  }
  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "";
  const isAdmin = adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase();

  // Verify current password.
  let currentOk = false;
  if (isAdmin) {
    const [row] = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, "password_hash"))
      .limit(1);
    if (row) {
      currentOk = await bcrypt.compare(currentPassword, row.value);
    } else {
      currentOk = currentPassword === (process.env.ADMIN_PASSWORD ?? "");
    }
  } else {
    if (!user.passwordHash) {
      return NextResponse.json({ error: "Смена пароля недоступна для этого аккаунта" }, { status: 400 });
    }
    currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
  }

  if (!currentOk) {
    return NextResponse.json({ error: "Неверный текущий пароль" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

  if (isAdmin) {
    await db
      .insert(adminSettings)
      .values({ key: "password_hash", value: newHash })
      .onConflictDoUpdate({
        target: adminSettings.key,
        set: { value: newHash, updatedAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
}
