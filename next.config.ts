import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application entièrement privée et dynamique (données par utilisatrice) : pas de pré-rendu.
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
