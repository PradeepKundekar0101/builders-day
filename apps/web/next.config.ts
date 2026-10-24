import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@buildwise/shared",
    "@buildwise/db",
    "@buildwise/estimator",
    "@buildwise/cost-guard",
    "@buildwise/masker",
  ],
  cacheComponents: true,
  partialPrefetching: true,
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
