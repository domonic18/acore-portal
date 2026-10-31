/**
 * .server info 文本解析(契约 §5:mock 英文样例;真机中文构建输出「服务器运行时间」)。
 * 独立纯函数模块,便于单测(不牵连 prisma/redis 连接)。
 */
export function parseServerInfo(text: string): {
  uptimeText: string | null;
  queueCount: number | null;
} {
  const uptime = /^(?:Uptime|服务器运行时间)[:：]\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  const queue = /(?:Connection queue|连接队列)[:：]\s*(\d+)/.exec(text);
  return { uptimeText: uptime, queueCount: queue ? Number(queue[1]) : null };
}
