/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 启动自检(FR-022):instrumentation register 在 Next 14 为实验特性
  experimental: {
    instrumentationHook: true,
  },
  // 按需编译的路由默认 60s 不活跃即被回收(Next onDemandEntries.maxInactiveAge),
  // 回收后再次访问该路由会重编译并推 HMR → 浏览器整页重载,
  // 跑测途中会打断交互(登录表单尚未 hydrate 就被点击 → 走原生 GET 提交,URL 停在 /login?)。
  // 拉长到 24h:dev 期间编译产物常驻,重编译只发生在真正改代码时。
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000,
  },
  eslint: {
    dirs: ["src", "scripts", "tests"],
  },
  // 安全响应头(2026-11-07,应用层兜底):
  // 边缘也有一套(生产 Caddy),但边缘不在本仓库、测试栈根本没有边缘,
  // 头设在应用层 → 任何部署形态下都成立。
  // CSP 只收「不破功能」的几条:门户要嵌 rank.lokta.cn 与第三方工具站、
  // 加载腾讯云验证码脚本与 wow.zamimg.com 图标,故不设 default-src/script-src
  // (一设就把子站 iframe、验证码、图片全打死);收紧留给后续按白名单逐条推进。
  // /uploads 路由自带更严的 CSP(default-src 'none'; sandbox),不重复叠加。
  async headers() {
    return [
      {
        source: "/:path((?!uploads/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // Playwright MCP 把 console 日志写进仓库内 .playwright-mcp/,dev 监听会造成
  // 「写日志→重编译→热更新→再写日志」自激循环;开发期忽略该目录。
  // tests/scripts/docs/specs 同理:跑 E2E 期间改动这些目录会触发重编译→HMR 整页刷新,
  // 打断正在交互的页面(登录表单未 hydrate 就被点击 → 走原生 GET 提交)。
  // workspace 是 MySQL/Redis 数据目录(仓库内):每次 DB 写都触发重编译 → 整页刷新,
  // 跑测途中必打断交互,必须忽略。
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/.playwright-mcp/**",
          "**/tests/**",
          "**/scripts/**",
          "**/docs/**",
          "**/specs/**",
          "**/workspace/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
