const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const ACCESS_COOKIE = "ap_access";

/**
 * 服务端 config 是进程级快照(只有 reloadSystemConfig 会重读 system_config):
 * E2E 用 Prisma 直改/还原 system_config 不会通知服务端,还原后快照仍是旧值
 * (例:后台设置用例写入的 E2E 值留在进程里,污染后续用例的页脚/主题断言)。
 * 这里借状态配置入口做一次空提交(零状态键写入),借其 reloadSystemConfig
 * 把快照拉回与数据库一致。
 */
export async function reloadServerConfig(accessToken: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/status-config`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: `${ACCESS_COOKIE}=${accessToken}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`E2E: 触发服务端 config 重载失败(status=${res.status})`);
  }
}
