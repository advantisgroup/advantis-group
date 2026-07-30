import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
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
    ];
  },
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
    ];
  },
};

export default withNextIntl(nextConfig);
