import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_STORAGE_MODE: process.env.STORAGE_MODE ?? "cloud",
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;