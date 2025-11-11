import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
