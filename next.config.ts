import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating Next.js logo / issues badge in local dev.
  // Compile and runtime errors still surface; production never shows this.
  devIndicators: false,
};

export default nextConfig;
