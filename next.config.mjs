/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    dirs: ["src", "scripts", "tests"],
  },
};

export default nextConfig;
