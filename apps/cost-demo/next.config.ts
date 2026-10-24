import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@buildwise/estimator", "@buildwise/cost-guard", "@buildwise/shared"],
};
export default config;
