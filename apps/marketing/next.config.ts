import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typedRoutes: false,
  // The whitepaper PDF is read from disk at runtime (see src/lib/whitepaper.ts),
  // so it has to be traced into the server bundle explicitly — nothing imports it.
  outputFileTracingIncludes: {
    "/api/[[...slugs]]": ["./private/**"],
    "/[locale]/whitepaper": ["./private/**"],
  },
  experimental: {
    globalNotFound: true,
    useTypeScriptCli: true
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.convex.cloud",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
        locale: false,
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
        locale: false,
      },
      {
        source: "/api/:path*",
        destination: "/api/:path*",
        locale: false,
      },
      {
        source: "/content/:path*",
        destination: "/content/:path*",
        locale: false,
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default withNextIntl(nextConfig);
