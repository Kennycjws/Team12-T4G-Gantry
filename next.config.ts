import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Windows app (desktop/) runs a self-contained server. Only its build turns this on,
  // so `npm run dev` and `npm run kiosk` work as before.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
