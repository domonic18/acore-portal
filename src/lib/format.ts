/**
 * 日期展示统一走东八区:避免 SSR/CSR 时区漂移,以及 toISOString() 取 UTC
 * 后在北京时间 00:00-08:00 差一天。
 *
 * 本模块是站内日期渲染的**唯一出口**:组件与页面一律调这里的函数,
 * 禁止直接 toLocaleString / toLocaleDateString / toISOString().slice 取日期
 * (裸调用会把展示时区交给运行时环境变量,换个容器就偏 8 小时;
 *  toISOString 取 UTC 则让北京时间 00:00-08:00 的内容显示成前一天);
 * 也不要用 getFullYear/getMonth/getDate 等本地时区分量拼日期/时间。
 *
 * 另:北京自然日的日界口径也收在这里(beijingDayStart / beijingDateKey),
 * 「今天/近 N 天」一律以北京自然日为界。
 *
 * 守卫:tests/unit/date-display-guard.test.ts。
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
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(toDate(value));
}

/** 时间(东八区):14:30:05 */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(toDate(value));
}

/**
 * 北京自然日口径(偏移固定 +08:00,无夏令时):
 * 站内「今天/昨日/近 N 天」一律以北京自然日为界,与展示时区一致——
 * 否则「今天」在 UTC 日界(北京 08:00)才翻页,与页面上显示的日期对不上。
 */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 北京自然日的起始瞬时(返回 UTC 瞬时,可直接用于查询条件) */
export function beijingDayStart(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + BEIJING_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - BEIJING_OFFSET_MS,
  );
}

/** 北京自然日的日期键(YYYY-MM-DD):日序列分桶与区间比较都用它 */
export function beijingDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 北京自然日的紧凑日期键(YYYYMMDD):Redis 日键/订单号日期段用 */
export function beijingDayKeyCompact(now: Date = new Date()): string {
  return beijingDateKey(now).replace(/-/g, "");
}

/** 北京时区偏移(无夏令时,恒 +08:00):墙钟字符串回传服务端时必须带它 */
export const BEIJING_ISO_OFFSET = "+08:00";

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
 * datetime-local 输入值(北京墙钟):YYYY-MM-DDTHH:mm
 * 入参是瞬时(UTC),按东八区折算成墙钟——与站内展示口径一致。
 * 不依赖进程本地时区:容器 TZ=Asia/Shanghai 只是便利,不是保证
 * (换个没配 TZ 的环境,本地时区折算会与展示差 8 小时)。
 * 独立于客户端组件模块:RSC 页面需直接调用(从 "use client" 模块导入非组件导出
 * 只会得到客户端引用代理,服务端调用会抛 "is not a function")。
 */
export function beijingDateTimeInput(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${formatDate(d)}T${timeFmt.format(d)}`;
}
