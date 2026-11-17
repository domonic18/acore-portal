// 站内搜索(M8)纯函数层:查询清洗 / 片段提取 / 高亮切分
// 无 IO、无框架依赖,单测锚死(tests/unit/search-highlight.test.ts)

import {
  SEARCH_MAX_TERM_LENGTH,
  SEARCH_MAX_TERMS,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/constants/search";

/**
 * 查询切词:剥操作符与空白,去重,限长限数。
 * BOOLEAN MODE 走短语匹配(词以双引号包裹),词内特殊字符失义,
 * 唯一要防的是引号本身(会破短语包裹)—— 在此剥净。
 */
export function extractTerms(q: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of q.split(/\s+/)) {
    const term = raw.replace(/["\\]/g, "").trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term.slice(0, SEARCH_MAX_TERM_LENGTH));
    if (terms.length >= SEARCH_MAX_TERMS) break;
  }
  return terms;
}

/** 切词 → BOOLEAN MODE 短语查询串;空词集返回空串(调用方视为无查询) */
export function buildBooleanQuery(terms: string[]): string {
  return terms
    .filter((t) => t.length >= SEARCH_MIN_QUERY_LENGTH || /[a-zA-Z0-9]/.test(t))
    .map((t) => `"${t}"`)
    .join(" ");
}

/** Markdown/HTML 剥离为纯文本(供片段提取;不求渲染级还原,只要可读) */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>|]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 命中片段:取首个词命中位置,向两侧扩展 radius 字符,补省略号。
 * 无命中回落开头截断(标题必有高亮,正文回落开头可接受)。
 */
export function extractSnippet(text: string, terms: string[], radius = 60): string {
  const normalized = text.length > 4000 ? text.slice(0, 4000) : text;
  let at = -1;
  let hitLen = 0;
  for (const term of terms) {
    const idx = normalized.toLowerCase().indexOf(term.toLowerCase());
    if (idx !== -1 && (at === -1 || idx < at)) {
      at = idx;
      hitLen = term.length;
    }
  }
  if (at === -1) {
    const head = normalized.slice(0, radius * 2);
    return (radius * 2 < normalized.length ? `…${head}…` : head) || "";
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(normalized.length, at + hitLen + radius);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

/** 高亮片段:{hit} 段渲染 <mark>,其余纯文本(React 渲染自动转义,无 XSS 面) */
export interface HighlightPart {
  text: string;
  hit: boolean;
}

export function highlightParts(text: string, terms: string[]): HighlightPart[] {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const parts: HighlightPart[] = [];
  let rest = text;
  while (rest) {
    let nearest: { at: number; len: number } | null = null;
    for (const term of sorted) {
      const idx = rest.toLowerCase().indexOf(term.toLowerCase());
      if (idx !== -1 && (nearest === null || idx < nearest.at)) {
        nearest = { at: idx, len: term.length };
      }
    }
    if (nearest === null) {
      parts.push({ text: rest, hit: false });
      break;
    }
    if (nearest.at > 0) parts.push({ text: rest.slice(0, nearest.at), hit: false });
    parts.push({ text: rest.slice(nearest.at, nearest.at + nearest.len), hit: true });
    rest = rest.slice(nearest.at + nearest.len);
  }
  return parts;
}
