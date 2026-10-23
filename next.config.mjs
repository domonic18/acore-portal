/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 启动自检(FR-022):instrumentation register 在 Next 14 为实验特性
  experimental: {
    instrumentationHook: true,
  },
  eslint: {
    dirs: ["src", "scripts", "tests"],
  },
};

export default nextConfig;
