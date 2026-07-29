import path from 'node:path';
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root — keeps standalone output tracing deterministic (build cwd is apps/web).
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['@onepct/shared'],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // Same-origin proxy → session cookies just work; no CORS.
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
