import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { inviteTokens, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const AcceptSchema = z.object({
  name: z.string().min(1, "Имя обязательно."),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов."),
  // Required only for shareable-link invites (email not pre-set on the token).
  email: z.string().email("Некорректный email.").optional(),
});

/** POST /api/auth/invite/[token]/accept — create creator user. Public. */
export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  let parsed: z.infer<typeof AcceptSchema>;
  try {
    const body = await req.json();
    const result = AcceptSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(inviteTokens)
    .where(eq(inviteTokens.token, params.token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Ссылка недействительна." }, { status: 404 });
  }
  if (row.usedAt) {
    return NextResponse.json({ error: "Это приглашение уже было использовано." }, { status: 400 });
  }
  if (new Date() > row.expiresAt) {
    return NextResponse.json({ error: "Срок приглашения истёк. Попросите владельца выслать новое." }, { status: 400 });
  }

  // Determine the final email: from the token (targeted) or from the form payload (shareable link).
  const finalEmail = row.email ?? parsed.email;
  if (!finalEmail) {
    return NextResponse.json({ error: "Email обязателен." }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, finalEmail))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует." }, { status: 409 });
  }

  const passwordHash = await hash(parsed.password, 12);

  await db.insert(users).values({
    tenantId: row.tenantId,
    email: finalEmail,
    name: parsed.name,
    role: "creator",
    creatorId: row.creatorId ?? null,
    passwordHash,
  });

  await db.update(inviteTokens).set({ usedAt: new Date() }).where(eq(inviteTokens.token, params.token));

  return NextResponse.json({ ok: true });
}
