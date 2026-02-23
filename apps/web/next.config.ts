import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8080/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:8080/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
