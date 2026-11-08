/**
 * 统计看板常量(2026-11-07 数据看板重构):
 * 时间范围口径 + WP Statistics 存档维度的展示归一化(设备/系统/浏览器/地区)。
 * 纯数据映射,不含 IO;服务层与展示层共用同一套口径。
 */

/** 看板时间范围键(URL 参数 range) */
export const STATS_RANGE_KEYS = ["7d", "30d", "90d", "all"] as const;
export type StatsRangeKey = (typeof STATS_RANGE_KEYS)[number];

/** 范围展示名 */
export const STATS_RANGE_LABEL: Record<StatsRangeKey, string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  "90d": "近 90 天",
  all: "全部",
};

/** 范围天数(null = 全部存档) */
export const STATS_RANGE_DAYS: Record<StatsRangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** 默认范围 */
export const STATS_RANGE_DEFAULT: StatsRangeKey = "30d";

/** 解析 URL 上的 range 参数(非法值回落默认) */
export function parseStatsRange(raw: string | undefined): StatsRangeKey {
  return (STATS_RANGE_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as StatsRangeKey)
    : STATS_RANGE_DEFAULT;
}

/**
 * 存档设备归一化(原始值来自 WP Statistics device 列:
 * desktop / mobile:smart / smartphone / mobile:feature / phablet / tablet / bot …)
 */
export const ARCHIVE_DEVICE_LABEL: Record<string, string> = {
  desktop: "桌面端",
  "mobile:smart": "手机",
  smartphone: "手机",
  "mobile:feature": "功能机",
  phablet: "大屏手机",
  tablet: "平板",
  bot: "爬虫/机器人",
  wearable: "可穿戴设备",
  tv: "电视",
};

/** 存档操作系统归一化(WP Statistics platform 列) */
export const ARCHIVE_PLATFORM_LABEL: Record<string, string> = {
  Windows: "Windows",
  Android: "Android",
  iOS: "iOS",
  "OS X": "macOS",
  Mac: "macOS",
  Linux: "Linux",
  Ubuntu: "Ubuntu",
  "Chrome OS": "ChromeOS",
  "FreeBSD": "FreeBSD",
};

/** 存档浏览器归一化(WP Statistics agent 列) */
export const ARCHIVE_BROWSER_LABEL: Record<string, string> = {
  Chrome: "Chrome",
  "Microsoft Edge": "Edge",
  Edge: "Edge",
  Firefox: "Firefox",
  "Internet Explorer": "IE",
  Safari: "Safari",
  "QQ Browser": "QQ 浏览器",
  "UC Browser": "UC 浏览器",
  "Sogou Explorer": "搜狗浏览器",
  "360SE": "360 安全浏览器",
  "360": "360 浏览器",
  Opera: "Opera",
  Maxthon: "Maxthon",
  "2345Explorer": "2345 浏览器",
  "Silk": "Silk",
  "Iron": "Iron",
};

/** 存档地区归一化(WP Statistics location 列,ISO 3166-1 alpha-2) */
export const ARCHIVE_COUNTRY_LABEL: Record<string, string> = {
  CN: "中国",
  TW: "中国台湾",
  HK: "中国香港",
  MO: "中国澳门",
  US: "美国",
  GB: "英国",
  SG: "新加坡",
  JP: "日本",
  KR: "韩国",
  CA: "加拿大",
  AU: "澳大利亚",
  PL: "波兰",
  DE: "德国",
  RU: "俄罗斯",
  FR: "法国",
  MX: "墨西哥",
  SE: "瑞典",
  IN: "印度",
  MY: "马来西亚",
  BR: "巴西",
  ES: "西班牙",
  TR: "土耳其",
  NL: "荷兰",
  IT: "意大利",
  TH: "泰国",
  VN: "越南",
  ID: "印度尼西亚",
  PH: "菲律宾",
  NZ: "新西兰",
  AT: "奥地利",
  CH: "瑞士",
  BE: "比利时",
  PT: "葡萄牙",
  GR: "希腊",
  UA: "乌克兰",
  KZ: "哈萨克斯坦",
  AR: "阿根廷",
  CL: "智利",
  ZA: "南非",
  AE: "阿联酋",
  SA: "沙特阿拉伯",
  IL: "以色列",
  EG: "埃及",
  DK: "丹麦",
  FI: "芬兰",
  NO: "挪威",
  IE: "爱尔兰",
  CZ: "捷克",
  HU: "匈牙利",
  RO: "罗马尼亚",
};

/** 未知维度占位(存档里空串 / '??' / '000' 均归此) */
export const ARCHIVE_UNKNOWN_LABEL = "未知";

/** 搜索引擎域名片段(用于从引荐 URL 里抽搜索词) */
export const SEARCH_ENGINE_HOST_FRAGMENTS = [
  "baidu.com",
  "bing.com",
  "google.",
  "so.com",
  "sogou.com",
  "sm.cn",
  "yandex.",
  "duckduckgo.com",
  "yahoo.",
  "aol.",
  "ecosia.org",
  "quark.cn",
] as const;

/** 搜索词参数名优先级(百度 wd / 多数引擎 q / 搜狗 query) */
export const SEARCH_TERM_PARAM_PRIORITY = [
  "wd",
  "q",
  "query",
  "text",
  "keyword",
] as const;

/** 搜索词最短长度(过滤百度垃圾词,如 'subjecth4l' 之类随机串) */
export const SEARCH_TERM_MIN_LENGTH = 2;

/** 搜索词最长长度(展示截断) */
export const SEARCH_TERM_MAX_LENGTH = 40;

/**
 * 判定域名是否搜索引擎:
 * 片段以 '.' 结尾(google./yandex./yahoo./aol.)按包含匹配,其余按域/子域匹配。
 */
export function isSearchEngineHost(host: string): boolean {
  const h = host.toLowerCase();
  return SEARCH_ENGINE_HOST_FRAGMENTS.some((frag) =>
    frag.endsWith(".") ? h.includes(frag) : h === frag || h.endsWith(`.${frag}`),
  );
}

/**
 * 地区码归一化:存档 location 为两位国家码,'000'/空串视为未知。
 */
export function archiveCountryLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!c || c === "000") return ARCHIVE_UNKNOWN_LABEL;
  return ARCHIVE_COUNTRY_LABEL[c] ?? c;
}

/**
 * 通用维度归一化:命中映射表用映射值,空值/占位符归「未知」,其余原样保留。
 */
export function archiveDimensionLabel(
  raw: string | null | undefined,
  labels: Record<string, string>,
): string {
  const v = (raw ?? "").trim();
  if (!v || v === "??" || v === "000") return ARCHIVE_UNKNOWN_LABEL;
  return labels[v] ?? v;
}
