import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens, adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов."),
});

export async function POST(request: Request) {
  let token: string, password: string;
  try {
    const body = await request.json();
    ({ token, password } = bodySchema.parse(body));
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let row: typeof passwordResetTokens.$inferSelect | undefined;
  try {
    [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
  } catch (err) {
    console.error("[reset-password] DB error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Ссылка недействительна." }, { status: 400 });
  }
  if (row.usedAt) {
    return NextResponse.json({ error: "Эта ссылка уже была использована." }, { status: 400 });
  }
  if (new Date() > row.expiresAt) {
    return NextResponse.json({ error: "Ссылка устарела. Запросите сброс пароля снова." }, { status: 400 });
  }

  const passwordHash = await hash(password, 12);

  try {
    await db
      .insert(adminSettings)
      .values({ key: "password_hash", value: passwordHash })
      .onConflictDoUpdate({ target: adminSettings.key, set: { value: passwordHash, updatedAt: new Date() } });

    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  } catch (err) {
    console.error("[reset-password] DB error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
