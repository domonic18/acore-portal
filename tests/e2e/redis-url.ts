import fs from "node:fs";

/**
 * E2E 进程直连 Redis 的连接串(清频控 key / 读统计桶):
 * 环境变量优先(CI 由 workflow 注入),其次本地 .env,最后回 dev 栈默认端口。
 *
 * 直读 .env 是为了与应用侧读同一份文件对齐;但 CI 无 .env 文件,
 * 早期写法在 CI 里 readFileSync 直接抛 ENOENT(spec 加载即崩),
 * 且进程环境里的 REDIS_URL(CI 注入)会被忽略 → 清频控清错 Redis,
 * 用例连发撞 429。故顺序固定为:环境变量 → .env(容错) → 默认端口。
 */
export function resolveE2ERedisUrl(): string {
  const fromEnv = process.env.REDIS_URL?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = fs.readFileSync(".env", "utf8").match(/^REDIS_URL=(.+)$/m)?.[1]?.trim();
    if (fromFile) return fromFile;
  } catch {
    // 无 .env(CI 干净检出)→ 走默认端口
  }
  return "redis://localhost:6381/0";
}
