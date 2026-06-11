/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Skip TS/ESLint re-checks on VPS builds — CI covers these before deploy.
  // Prevents OOM on memory-constrained VPS (clean builds without incremental cache).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.contentradar.app" }],
        destination: "https://contentradar.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // CSP is set per-request in middleware.ts with a fresh nonce to eliminate
          // 'unsafe-inline' in script-src. No static CSP header here.
        ],
      },
    ];
  },
};

export default nextConfig;
