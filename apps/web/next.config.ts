import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
})({
  output: "export",
  // turbopack: {} tells Next.js 16 we know about Turbopack in dev;
  // the webpack config below applies only to production builds (static export).
  turbopack: {},
  webpack(config) {
    config.output.workerChunkLoading = "import-scripts";
    return config;
  },
});

export default nextConfig;
