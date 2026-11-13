import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
