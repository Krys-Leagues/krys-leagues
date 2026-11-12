import { existsSync } from "node:fs"
import path from "node:path"
import type { NextConfig } from "next";

const projectRoot = process.cwd()
const installedDependenciesRoot = existsSync(path.join(projectRoot, "node_modules", "next", "package.json"))
  ? projectRoot
  : path.resolve(projectRoot, "..", "..")

const nextConfig: NextConfig = {
  turbopack: { root: installedDependenciesRoot },
  outputFileTracingIncludes: {
    "/api/admin/kwt-website-recovery": [
      "./docs/historical-sources/kwt/website-score-recovery/normalized/*.csv",
      "./docs/historical-sources/kwt/website-score-recovery/source-catalog.json",
      "./docs/historical-sources/kwt/website-score-recovery/raw-response-manifest.json",
      "./docs/historical-sources/kwt/website-score-recovery/identity-candidates.json",
    ],
  },
};

export default nextConfig;
