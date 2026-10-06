import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(!development ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),

];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    workerThreads: true,
    cpus: 1,
  },
  // TypeScript is checked separately by `npm run typecheck`. This avoids a
  // duplicate child process in Windows environments that block process spawn.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
