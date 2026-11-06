import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Monorepo root: `next build` runs with cwd = apps/web.
const repoRoot = resolve(process.cwd(), '..', '..');

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    authInterrupts: true,
    serverActions: { bodySizeLimit: '26mb' },
  },
  // Workspace packages export TypeScript source directly (ADR 0014 / pnpm
  // workspace layout), so Next must transpile them.
  transpilePackages: [
    '@oncobrief/domain',
    '@oncobrief/ports',
    '@oncobrief/adapters',
    '@oncobrief/db',
  ],
  // Native / server-only modules must not be bundled.
  serverExternalPackages: ['pg', '@node-rs/argon2', 'dotenv', 'pdf-lib'],
  outputFileTracingRoot: repoRoot,
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/api/v1/patient-portal/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-actor-role, x-organization-slug' },
          { key: 'Access-Control-Expose-Headers', value: 'Retry-After' },
        ],
      },
    ];
  },
  webpack: (webpackConfig, { isServer }) => {
    // The workspace packages use extensionless relative imports at runtime
    // (Bundler resolution); nothing extra is needed, but the native argon2
    // addon must be left external on the server graph.
    if (isServer) {
      const externals = Array.isArray(webpackConfig.externals) ? webpackConfig.externals : [];
      webpackConfig.externals = [
        ...externals,
        {
          '@node-rs/argon2': 'commonjs @node-rs/argon2',
          pg: 'commonjs pg',
          dotenv: 'commonjs dotenv',
          'pdf-lib': 'commonjs pdf-lib',
        },
      ];
    }
    return webpackConfig;
  },
};

export default config;
