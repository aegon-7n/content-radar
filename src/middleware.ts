import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

const KNOWN_PAGE_ROUTES = /^\/($|dashboard(\/.*)?$|creators(\/[^/]+)?$|products(\/[^/]+)?$|videos(\/[^/]+)?$|settings(\/team)?$|admin(\/.*)?$)/;

function unauthorizedBasic() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CEO Admin"' },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CEO admin paths use HTTP Basic Auth — no NextAuth session involved.
  if (pathname.startsWith("/ceo-")) {
    const authHeader = request.headers.get("authorization");
    const expectedUser = process.env.CEO_ADMIN_USER ?? "";
    const expectedPass = process.env.CEO_ADMIN_PASS ?? "";

    if (!expectedUser || !authHeader || !authHeader.startsWith("Basic ")) {
      return unauthorizedBasic();
    }

    let user: string, pass: string;
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const colonIdx = decoded.indexOf(":");
      user = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
      pass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
    } catch {
      return unauthorizedBasic();
    }

    if (user !== expectedUser || pass !== expectedPass) {
      return unauthorizedBasic();
    }

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
    "/((?!login|register|invite|forgot-password|reset-password|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|api/auth|api/ping|api/forgot-password|api/reset-password|api/scrape|api/waitlist|api/billing/webhooks|api/admin/seed-patterns).*)",
  ],
};
