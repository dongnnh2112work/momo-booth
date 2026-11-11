import type { NextConfig } from "next";

const immutable: { source: string; headers: { key: string; value: string }[] }[] = [
  "/portraits/:path*",
  "/brand/:path*",
  "/cubes/:path*",
].map((source) => ({
  source,
  headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
}));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return immutable;
  },
};

export default nextConfig;
