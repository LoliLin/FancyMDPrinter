import type { NextConfig } from "next";

// GitHub Pages sets PAGES_BASE_PATH (e.g. "/FancyMDPrinter") via
// actions/configure-pages when deploying a project site. For a user site
// (<user>.github.io) it stays empty. NEXT_PUBLIC_BASE_PATH is an escape
// hatch for other static hosts.
const basePath =
  process.env.PAGES_BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
