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
  // Playwright MCP 把 console 日志写进仓库内 .playwright-mcp/,dev 监听会造成
  // 「写日志→重编译→热更新→再写日志」自激循环;开发期忽略该目录
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/.playwright-mcp/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
