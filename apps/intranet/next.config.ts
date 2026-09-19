import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // React Compiler runs as a Babel pass, which takes every module off Next's
  // SWC fast path — the bulk of the 30s dev compiles (a route reporting
  // "next.js: 36.5s" against 52ms of application code is all compilation).
  // It only inserts memoization, so dev doesn't need it; production builds
  // still get it. Set REACT_COMPILER=1 to check its output locally.
  reactCompiler: process.env.NODE_ENV === "production" || process.env.REACT_COMPILER === "1",
  typedRoutes: false,
  // react-pdf/pdfjs-dist ship modern-syntax ESM meant for native
  // <script type=module> use; Next's official Next.js integration guide for
  // react-pdf recommends transpiling both rather than leaving them raw.
  // @advantis/convex's `./performance/*` subpaths point straight at raw
  // .ts source (there's no build step for that package) so the client-side
  // report-rescan feature can reuse the same parsing logic the Convex
  // import pipeline uses — this is what makes Next transpile that source
  // instead of erroring on it.
  transpilePackages: ["pdfjs-dist", "react-pdf", "@advantis/convex"],
  images: {
    remotePatterns: [
      // Convex file storage (avatars, chat images, announcement attachments)
      { protocol: "https", hostname: "*.convex.cloud" },
      // Prod Convex sits behind this custom domain instead of *.convex.cloud.
      { protocol: "https", hostname: "backend.advantisgroup.de" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  experimental: {
    useTypeScriptCli: true,
  },
  async rewrites() {
    return [
      {
        source: "/hr/:path*",
        destination: "/applicants/:path*",
      },
      {
        source: "/clockodo/manage/:path*",
        destination: "/admin/integrations/clockodo/:path*",
      },
      // PostHog ingest proxy (mirrors apps/marketing) — same-origin so
      // ad-blockers don't strip analytics for signed-in employees either.
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
    ];
  },
  // Required to support PostHog trailing slash API requests.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      // ActivityTrack moved out from under /admin — keep old bookmarks/links working.
      {
        source: "/admin/activity/:path*",
        destination: "/activity/:path*",
        permanent: true,
      },
      {
        source: "/absences/:path*",
        destination: "/clockodo/:path*",
        permanent: true,
      },
      {
        source: "/applicants/:path*",
        destination: "/hr/:path*",
        permanent: true,
      },
      {
        source: "/admin/integrations/clockodo/:path*",
        destination: "/clockodo/manage/:path*",
        permanent: true,
      },
      {
        source: "/t/:path*",
        destination: "/playground/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
