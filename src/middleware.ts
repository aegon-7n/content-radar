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

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // nonce covers Next.js RSC inline scripts; 'self' covers external chunks from /_next/static/
    `script-src 'self' 'nonce-${nonce}'`,
    // 'unsafe-inline' required for React style={} props (rendered as HTML style attributes)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward nonce to Next.js server so it applies it to RSC inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CEO admin paths use HTTP Basic Auth — no NextAuth session involved.
  if (pathname.startsWith("/ceo-")) {
    const authHeader = request.headers.get("authorization");
    const expectedUser = process.env.CEO_ADMIN_BASIC_USER ?? "";
    const expectedPass = process.env.CEO_ADMIN_BASIC_PASS ?? "";

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

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  if (!isApi && !KNOWN_PAGE_ROUTES.test(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
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

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  // Expanded from prior list: login/register/forgot-password/reset-password/invite now
  // enter middleware so they also receive nonce-based CSP. They pass through unauthenticated
  // (not in KNOWN_PAGE_ROUTES). Public API endpoints remain in the exclusion list.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/auth|api/ping|api/forgot-password|api/reset-password|api/scrape|api/waitlist|api/billing/webhooks|api/patterns/seed).*)",
  ],
};
