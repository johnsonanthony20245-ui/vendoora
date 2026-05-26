import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vendoora/types', '@vendoora/db'],
  // Pin the workspace root so Next doesn't pick up the user-home
  // package-lock.json as the inferred root in monorepo builds.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      // Picsum: sample product images until Cloudflare R2 wiring lands (P1.3.7).
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/seed/**' },
      { protocol: 'https', hostname: 'fastly.picsum.photos', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
