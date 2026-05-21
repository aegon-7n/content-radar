import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

const KNOWN_PAGE_ROUTES = /^\/($|creators(\/[^/]+)?$|products(\/[^/]+)?$|videos(\/[^/]+)?$|settings$|admin\/waitlist$)/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (!isApi && !KNOWN_PAGE_ROUTES.test(pathname)) {
    return NextResponse.next();
  }

  try {
    const token = await getToken({ req: request, secret: SECRET });

    if (!token) {
      if (isApi) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!login|register|invite|forgot-password|reset-password|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|api/auth|api/health|api/scrape|api/waitlist|api/billing/webhooks).*)",
  ],
};
