// 内容转换器(US2 T011;research R1):wp 正文 HTML → bodyMd 单格式
// 仅迁移期使用(mjs,被 content-import 与单测共用);图片重写经注入的同步查找
// (import 先把 image_asset_map 装载为 Map——turndown 规则是同步的,不能回库查询)
// 类型声明见同目录 content-convert.d.mts
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export function createConverter(resolveImage) {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  td.use(gfm);
  if (resolveImage) {
    td.addRule("rewriteImage", {
      filter: "img",
      replacement: (_content, node) => {
        const src = node.getAttribute("src") ?? "";
        const alt = node.getAttribute("alt") ?? "";
        const target = resolveImage(src) ?? src;
        return `![${alt}](${target})`;
      },
    });
  }
  return (html) => td.turndown(html ?? "");
}

/** wp post_name(URL 编码)→ 解码 slug;缺失/畸形回退 legacy-{id} */
export function decodeSlug(postName, postId) {
  if (!postName) return `legacy-${postId}`;
  try {
    const decoded = decodeURIComponent(postName);
    return decoded || `legacy-${postId}`;
  } catch {
    return `legacy-${postId}`;
  }
}

/** wowhead 短代码 [item=123] → 标准 Markdown 链接(存量正文 0 处,防御迁移期插件残留);
 *  turndown 会把裸 [ ] 转义成 \[ \],两种形态都接受并输出未转义链接 */
export function normalizeWowheadShortcodes(markdown) {
  return markdown.replace(
    /\\?\[(item|spell|npc|quest)=(\d+)\\?\]/g,
    "[$1=$2](https://www.wowhead.com/$1=$2)",
  );
}

/** HTML → 纯文本摘要(实体解码,码点安全截断 500) */
export function extractExcerpt(html, max = 500) {
  const text = (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    // 标签剥离引入的邻接空格在 CJK 文字间很突兀(你好 世界&再见 → 你好世界&再见)
    .replace(/([一-鿿）】》”]) +(?=[一-鿿（【《“&])/g, "$1")
    .trim();
  return [...text].slice(0, max).join("");
}

/** 中文日期 "2023年1月1日" → "2023-01-01";不可解析返回 null */
export function parseCnDate(text) {
  if (typeof text !== "string") return null;
  const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(text.trim());
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 渐进计划页(cp-timeline 区块)→ 节点源数据;"To be continued" 装饰行剔除 */
export function parseProgressionBlocks(pageHtml) {
  const nodes = [];
  for (const [, raw] of pageHtml?.matchAll(
    /<!-- wp:cp-timeline\/content-timeline-block-child ({[\s\S]*?}) -->/g,
  ) ?? []) {
    let attrs;
    try {
      attrs = JSON.parse(raw);
    } catch {
      continue;
    }
    const heading = typeof attrs.time_heading === "string" ? attrs.time_heading.trim() : "";
    if (!heading || /to be continued/i.test(heading)) continue;
    const date = parseCnDate(attrs.t_date);
    nodes.push({
      heading,
      date,
      descHtml: typeof attrs.time_desc === "string" ? attrs.time_desc : "",
      imageUrl:
        typeof attrs.timeLineImage === "string" && attrs.timeLineImage !== ""
          ? attrs.timeLineImage
          : null,
      open: attrs.icon === "FaRegCheckCircle" && date != null,
      blockId: typeof attrs.block_id === "string" ? attrs.block_id : null,
    });
  }
  return nodes;
}
