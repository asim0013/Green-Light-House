import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Standalone output for the Docker runtime image (Dockerfile runner stage).
  output: "standalone",
};

// next-intl plugin — points at the request config that loads per-locale messages.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
