import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

export async function middleware(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: SECRET });

    if (!token) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  } catch {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!login|forgot-password|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|api/auth|api/health|api/scrape|api/waitlist|api/billing/webhooks).*)",
  ],
};
