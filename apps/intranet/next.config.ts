import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: false,
  images: {
    remotePatterns: [
      // Convex file storage (avatars, chat images, announcement attachments)
      { protocol: "https", hostname: "*.convex.cloud" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
