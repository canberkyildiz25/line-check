import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // LibreDWG's glue code has a Node.js branch that imports these; the browser never takes it.
    resolveAlias: {
      module: "./lib/empty-module.ts",
      fs: { browser: "./lib/empty-module.ts" },
      path: { browser: "./lib/empty-module.ts" },
      url: { browser: "./lib/empty-module.ts" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
