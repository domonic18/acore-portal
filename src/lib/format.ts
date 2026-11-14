/**
 * 日期展示统一走东八区:避免 SSR/CSR 时区漂移,以及 toISOString() 取 UTC
 * 后在北京时间 00:00-08:00 差一天。
 */
const TZ = "Asia/Shanghai";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** 日期(东八区):2026-11-01 */
export function formatDate(value: string | Date): string {
  return dateFmt.format(toDate(value));
}

/** 短日期(东八区):11-01 */
export function formatShortDate(value: string | Date): string {
  return formatDate(value).slice(5);
}

/** 日期时间(东八区):2026-11-01 14:30 */
export function formatDateTimeShort(value: string | Date): string {
  return `${formatDate(value)} ${timeFmt.format(toDate(value))}`;
}

/** 中文日期时间(东八区):2026/11/01 14:30 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * 后台展示口径:存量 WP 户 login 多为 QQ 号等数字串,昵称才是玩家称呼。
 * 昵称与用户名相同(迁移链把 login 原样带成昵称)时不重复展示两遍。
 */
export function displayUserName(u: { username: string | null; nickname?: string | null }): string {
  const username = (u.username ?? "").trim();
  const nickname = (u.nickname ?? "").trim();
  if (!username) return nickname;
  if (!nickname || nickname === username) return username;
  return `${nickname} (${username})`;
}

/**
 * 分段拼接(页脚版权行):空段(未配置/留空隐藏)不参与,分隔符统一 " · "。
 * 例:["© 2026", "老克塔 LoktaCN", "怀旧公益项目(非营利)"]
 *   → "© 2026 · 老克塔 LoktaCN · 怀旧公益项目(非营利)"
 */
export function joinSegments(segments: readonly (string | null | undefined)[]): string {
  return segments
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** 脱敏占位符(连接串口令段替换成它) */
export const MASK_PLACEHOLDER = "***";

/**
 * 连接串脱敏(游戏库):口令段替换为 ***,host/库名等其余部分保持可见,
 * 供后台回显——管理员看得见改的是哪台库,又不必把口令摆在屏幕上。
 * 非 URL 或不含口令时原样返回。
 */
export function maskConnectionUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.password) return url;
    u.password = MASK_PLACEHOLDER;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * ISO 时间 → datetime-local 输入值(本地时区 YYYY-MM-DDTHH:mm);空/非法回 null。
 * 独立于客户端组件模块:RSC 页面需直接调用(从 "use client" 模块导入非组件导出
 * 只会得到客户端引用代理,服务端调用会抛 "is not a function")。
 */
export function isoToDateTimeInput(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
