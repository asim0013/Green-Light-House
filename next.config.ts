import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker runtime image (Dockerfile runner stage).
  output: "standalone",
};

export default nextConfig;
