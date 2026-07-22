import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: false,
  // react-pdf/pdfjs-dist ship modern-syntax ESM meant for native
  // <script type=module> use; Next's official Next.js integration guide for
  // react-pdf recommends transpiling both rather than leaving them raw.
  transpilePackages: ["pdfjs-dist", "react-pdf"],
  images: {
    remotePatterns: [
      // Convex file storage (avatars, chat images, announcement attachments)
      { protocol: "https", hostname: "*.convex.cloud" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
  async redirects() {
    return [
      // ActivityTrack moved out from under /admin — keep old bookmarks/links working.
      {
        source: "/admin/activity/:path*",
        destination: "/activity/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
