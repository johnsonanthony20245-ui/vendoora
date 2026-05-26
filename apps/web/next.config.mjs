import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vendoora/types'],
  // Pin the workspace root so Next doesn't pick up the user-home
  // package-lock.json as the inferred root in monorepo builds.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
