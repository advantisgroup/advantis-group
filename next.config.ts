import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  reactCompiler: true,
  experimental: {
    globalNotFound: true
  }
};

export default nextConfig;
