/**
 * 站点 URL 的展示辅助(纯函数):
 * 蜘蛛日志/外链形态的完整 URL 在看板里只显示路径——域名前缀把截断后的
 * 可见宽度全吃掉,用户只能看到「https://lokta.cn/?page=...」的前半截。
 */

export type SplitSiteUrl = { origin: string; path: string };

/** 拆出协议+域名前缀;已是站内相对路径则原样返回 */
export function splitSiteUrl(raw: string): SplitSiteUrl {
  const match = raw.match(/^https?:\/\/[^/]+(\/.*)?$/);
  if (!match) return { origin: "", path: raw };
  return { origin: raw.slice(0, raw.length - (match[1]?.length ?? 0)), path: match[1] ?? "/" };
}

/** 展示用解码:含百分号编码时尝试解码(乱码/坏编码回落原文) */
export function decodeUrlForDisplay(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
