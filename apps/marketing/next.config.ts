import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typedRoutes: false,
  // for `@advantis/convex/marketing/inquiry`, which is exported as TypeScript source
  transpilePackages: ["@advantis/convex"],
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
      // Prod Convex sits behind this custom domain instead of *.convex.cloud.
      {
        protocol: "https",
        hostname: "backend.advantisgroup.de",
      },
    ],
  },
  async rewrites() {
    return [
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
  // Was here to let PostHog's trailing-slash API calls through the proxy.
  // PostHog is gone, but flipping this back now would start redirecting
  // every trailing-slash URL on a live site — left alone deliberately.
  skipTrailingSlashRedirect: true,
};

export default withNextIntl(nextConfig);
