import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@buildwise/shared", "@buildwise/db"],
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
