import { test, expect, request } from "@playwright/test";

/**
 * S13 — Unauth API Guard
 *
 * Post-mortem action item from TRU-104 / TRU-97 incident.
 * Regression: middleware.ts had a regex that excluded ALL /api/* from auth checks.
 * These tests call each protected endpoint without a session and assert 401.
 * Public allowlist routes (health, waitlist) must NOT return 401.
 */

const PROTECTED_ENDPOINTS = [
  { id: "S13-A", path: "/api/dashboard" },
  { id: "S13-B", path: "/api/products" },
  { id: "S13-C", path: "/api/creators" },
  { id: "S13-D", path: "/api/videos" },
  { id: "S13-E", path: "/api/settings/creators" },
  { id: "S13-F", path: "/api/settings/products" },
  { id: "S13-G", path: "/api/videos/export" },
  { id: "S13-H", path: "/api/last-sync" },
];

const PUBLIC_ENDPOINTS = [
  { id: "S13-I", path: "/api/health", method: "GET", expectedStatuses: [200] },
  // S13-J: /api/waitlist is in the middleware allowlist.
  // Only POST is exported — GET returns 405 from Next.js, proving the
  // middleware let the request through (middleware 401 would appear instead).
  // POST /api/waitlist without WAITLIST_INGEST_SECRET returns a route-level
  // 401 which is intentional bearer-token protection, not NextAuth middleware.
  { id: "S13-J", path: "/api/waitlist", method: "GET", expectedStatuses: [405] },
];

test.describe("S13 — Unauth API Guard (no session)", () => {
  let apiContext: Awaited<ReturnType<typeof request.newContext>>;

  test.beforeAll(async () => {
    // Fresh context with no cookies / auth headers
    apiContext = await request.newContext({
      baseURL: process.env.BASE_URL ?? "http://localhost:3000",
      extraHTTPHeaders: { Accept: "application/json" },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  for (const { id, path } of PROTECTED_ENDPOINTS) {
    test(`${id}: GET ${path} без сессии → 401`, async () => {
      const response = await apiContext.get(path);
      expect(
        response.status(),
        `${id}: expected 401 from ${path}, got ${response.status()}`
      ).toBe(401);

      // Response body should be JSON with an "error" field
      const body = await response.json().catch(() => null);
      expect(body, `${id}: response body should be JSON`).not.toBeNull();
      expect(body).toHaveProperty("error");
    });
  }

  for (const { id, path, method, expectedStatuses } of PUBLIC_ENDPOINTS) {
    test(`${id}: ${method} ${path} без сессии → ${expectedStatuses.join("/")} (публичный)`, async () => {
      const response =
        method === "GET"
          ? await apiContext.get(path)
          : await apiContext.post(path, { data: {} });

      expect(
        expectedStatuses,
        `${id}: expected one of [${expectedStatuses}] from ${path}, got ${response.status()}`
      ).toContain(response.status());

      // Public endpoints must NOT return 401
      expect(
        response.status(),
        `${id}: public endpoint ${path} must not require auth`
      ).not.toBe(401);
    });
  }
});
