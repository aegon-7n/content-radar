import { NextResponse } from "next/server";

// Self-serve registration is disabled. Tenants are created manually by admin.
export async function POST() {
  return NextResponse.json(
    { error: "Регистрация закрыта. Доступ предоставляется по заявке." },
    { status: 403 },
  );
}
