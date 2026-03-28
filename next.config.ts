import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Parent folders (e.g. user home) may contain another package-lock.json; anchor tracing to this app.
  outputFileTracingRoot: projectDir,
  serverExternalPackages: ["@prisma/client"],
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg" }];
  },
};

export default nextConfig;
