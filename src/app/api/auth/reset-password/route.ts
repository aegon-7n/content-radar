import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, passwordResetTokens, adminSettings } from "@/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Пароль минимум 8 символов"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? "Ошибка валидации" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  try {
    const now = new Date();

    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          gt(passwordResetTokens.expiresAt, now),
          isNull(passwordResetTokens.usedAt)
        )
      )
      .limit(1);

    if (!resetToken) {
      return NextResponse.json(
        { error: "Ссылка недействительна или устарела" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Update user's password hash in users table
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.email, resetToken.email));

    // Also update admin_settings if this email matches ADMIN_EMAIL
    if (
      process.env.ADMIN_EMAIL &&
      resetToken.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
    ) {
      await db
        .insert(adminSettings)
        .values({ key: "password_hash", value: passwordHash })
        .onConflictDoUpdate({
          target: adminSettings.key,
          set: { value: passwordHash, updatedAt: new Date() },
        });
    }

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.token, token));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset-password] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
