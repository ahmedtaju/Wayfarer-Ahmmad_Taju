import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "path";

const API_BACKEND_URL = process.env.API_URL || "http://localhost:3001";

const nextConfig = (phase: string): NextConfig => ({
  // Browser tests and a running development server must not share build output.
  distDir: phase === PHASE_DEVELOPMENT_SERVER
    ? process.env.WAYFARER_BROWSER_TEST === "1" ? ".next-e2e" : ".next-dev"
    : ".next",
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BACKEND_URL}/api/:path*`,
      },
    ];
  },
});

export default nextConfig;
