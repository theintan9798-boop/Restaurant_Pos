/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['shared-types', 'pos-ui'],
};

module.exports = nextConfig;