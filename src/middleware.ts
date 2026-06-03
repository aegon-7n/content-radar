import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

const KNOWN_PAGE_ROUTES = /^\/($|dashboard(\/patterns)?$|creators(\/[^/]+)?$|products(\/[^/]+)?$|videos(\/[^/]+)?$|settings(\/team)?$|admin\/waitlist$|admin\/referrals$)/;

function checkCeoBasicAuth(request: NextRequest): NextResponse | null {
  const ceoUser = process.env.CEO_ADMIN_BASIC_USER ?? "";
  const ceoPass = process.env.CEO_ADMIN_BASIC_PASS ?? "";

  if (!ceoUser || !ceoPass) {
    return new NextResponse("CEO admin not configured", { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`${ceoUser}:${ceoPass}`)}`;

  if (authHeader !== expected) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="ContentRadar CEO Admin"' },
    });
  }

  return null; // auth OK
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CEO secret admin area — basic auth only, no NextAuth session
  if (pathname.startsWith("/ceo-x7Hg9pQ2Wf")) {
    const authError = checkCeoBasicAuth(request);
    if (authError) return authError;
    return NextResponse.next();
  }

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

    if (pathname === "/dashboard") {
      return NextResponse.redirect(new URL("/", request.url));
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
    "/((?!login|register|invite|forgot-password|reset-password|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|api/auth|api/ping|api/forgot-password|api/reset-password|api/scrape|api/waitlist|api/billing/webhooks).*)",
  ],
};
