import type { NextConfig } from "next";
import path from "path";

const API_BACKEND_URL = process.env.API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
