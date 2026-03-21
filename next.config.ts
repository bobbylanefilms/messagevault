// ABOUTME: Next.js configuration for MessageVault.
// ABOUTME: Enables Turbopack and React Compiler (defaults in Next.js 16.x).

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
