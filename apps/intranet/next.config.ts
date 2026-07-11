import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: false,
  // pdfjs-dist ships modern-syntax ESM meant for native <script type=module>
  // use; left un-transpiled, webpack's production minifier mishandles its
  // class syntax and throws "Class constructor X cannot be invoked without
  // 'new'" at runtime. Routing it through Next's SWC pipeline avoids that.
  transpilePackages: ["pdfjs-dist"],
  images: {
    remotePatterns: [
      // Convex file storage (avatars, chat images, announcement attachments)
      { protocol: "https", hostname: "*.convex.cloud" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
