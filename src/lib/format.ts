/** 统一东八区展示,避免 SSR/CSR 时区漂移导致的 hydration 不一致 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** 后台展示口径:存量 WP 户 login 多为 QQ 号等数字串,昵称才是玩家称呼 */
export function displayUserName(u: { username: string | null; nickname?: string | null }): string {
  return u.nickname ? `${u.nickname} (${u.username})` : (u.username ?? "");
}
