/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable persistent filesystem cache in dev to prevent stale CSS/Tailwind issues
  experimental: {
    // Force fresh CSS compilation on every dev server start
    optimizeCss: false,
  },
  // Ensure webpack doesn't cache between restarts in dev
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
}

module.exports = nextConfig
