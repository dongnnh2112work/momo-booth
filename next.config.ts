import type { NextConfig } from "next";

const immutable: { source: string; headers: { key: string; value: string }[] }[] = [
  "/portraits/:path*",
  "/brand/:path*",
  "/cubes/:path*",
].map((source) => ({
  source,
  headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
}));

type ResolveData = { request?: string };
type NormalModuleFactory = {
  hooks: { beforeResolve: { tap: (name: string, hook: (data: ResolveData) => void) => void } };
};
type Compiler = {
  hooks: { normalModuleFactory: { tap: (name: string, hook: (factory: NormalModuleFactory) => void) => void } };
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    const plugin = {
      apply(compiler: Compiler) {
        compiler.hooks.normalModuleFactory.tap("node-scheme", (factory) => {
          factory.hooks.beforeResolve.tap("node-scheme", (resolveData) => {
            if (resolveData.request?.startsWith("node:")) {
              resolveData.request = resolveData.request.slice("node:".length);
            }
          });
        });
      },
    };
    config.plugins.push(plugin);
    return config;
  },
  async headers() {
    return immutable;
  },
};

export default nextConfig;
