import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeParse from "rehype-parse";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import type { Element, Root, Text } from "hast";
import { toSameSiteHref } from "@/constants/legacy-routes";

/**
 * Markdown 渲染管线收口(M3 research R3):
 * unified + remark-gfm + remark-breaks + remark-cjk-friendly + rehype-raw +
 * rehype-highlight + rehype-slug + rehype-sanitize 白名单。
 * 原始 HTML 经 rehype-raw 解析为节点后由 sanitize 白名单兜底(标签/属性/协议三级
 * 过滤,script/style/iframe 连内容剔除),存量 WP 正文里的表格/加粗不再整块丢失。
 * 图片域白名单:站内相对路径 + cdnHosts 参数(RSC 调用方传 cos.cdnBase 域)。
 */

export type TocItem = { id: string; text: string; depth: 2 | 3 | 4 };

// 存量正文链接带语言/子域前缀(www.wowhead.com/cn/item=…),允许单个小写段
const WOWHEAD_URL =
  /^https?:\/\/(?:www|classic|wotlk)\.wowhead\.com(?:\/[a-z-]+)?\/(item|spell|npc|quest)=(\d+)/;

/** sanitize 白名单:默认 schema + 高亮 span/语言类/锚点 id/wowhead 属性(R3) */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "span"],
  // style/iframe 连内容剔除(默认 schema 只剔除 script,style 的 CSS 文本会
  // 作为可见文本漏到正文里)
  strip: [...(defaultSchema.strip ?? []), "style", "iframe"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? [])],
    h1: ["id"],
    h2: ["id", ["dataSection", /^note$/]],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
    span: [["className", /^hljs[-\w]*$/]],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["dataWowhead", /^(item|spell|npc|quest)=\d+$/],
    ],
  },
} as const;

/** wowhead 链接自动标注 data-wowhead(R3b;离线降级=普通链接,M2 商品页先例) */
function rehypeWowhead() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = (node.properties?.href as string | undefined) ?? "";
      const m = WOWHEAD_URL.exec(href);
      if (m) node.properties.dataWowhead = `${m[1]}=${m[2]}`;
    });
  };
}

/**
 * 旧站绝对链接改为站内相对地址(issue #24):迁移正文硬编码了
 * http://lokta.cn/?p=… 等地址,dev/test 环境点开会被带到线上站点。
 * 改写成 /?p=… 后由 middleware 按 route_map 解析到当前环境的对应页面。
 */
function rehypeLegacyLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string") return;
      const sameSite = toSameSiteHref(href);
      if (sameSite) node.properties.href = sameSite;
    });
  };
}

/** 图片域白名单:非法 src 的 img 整节点移除(渲染期硬闸,迁移期重写为前提) */
function rehypeImageAllowlist(cdnHosts: readonly string[]) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "img" || parent == null || index == null) {
        return undefined;
      }
      const src = (node.properties?.src as string | undefined) ?? "";
      const allowed =
        src.startsWith("/") ||
        cdnHosts.some((host) => src.startsWith(`https://${host}/`));
      if (allowed) return undefined;
      (parent.children as Element[]).splice(index, 1);
      return [SKIP, index];
    });
  };
}

/**
 * 稳定章节锚点:按标题文案把 rehype-slug 生成的中文 id 覆写为约定英文 id
 * (教程页下载区沿用旧站锚点,菜单与外链共用;取首个命中标题)。
 * 置于 sanitize 之后:仅覆写本模块常量锚点,sanitize 的 clobberPrefix 不作用于
 * 该 id,保证 URL 与旧站 #client_download 一致。
 */
function rehypeSectionAnchors(
  anchors: readonly { id: string; match: RegExp }[],
) {
  return (tree: Root) => {
    for (const { id, match } of anchors) {
      let assigned = false;
      visit(tree, "element", (node: Element) => {
        if (assigned || !/^h[1-6]$/.test(node.tagName)) return;
        if (!match.test(textOf(node))) return;
        node.properties.id = id;
        assigned = true;
      });
    }
  };
}

/** TOC 提取(rehype-slug 生成 id 后收 h2-h4;渲染产物同源锚点) */
function rehypeCollectToc(toc: TocItem[]) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const m = /^h([2-4])$/.exec(node.tagName);
      if (!m) return;
      const id = (node.properties?.id as string | undefined) ?? "";
      const text = textOf(node);
      if (id && text) toc.push({ id, text, depth: Number(m[1]) as TocItem["depth"] });
    });
  };
}

/**
 * 静态页小节标题(p02 设计稿):存量 WP 正文用「**服务器特色：**」独占段落表达小节,
 * 渲染时提升为 h2 以套用设计稿的分节竖条;「免责声明」额外标记 data-section=note。
 * 仅显式开启 sections 的调用方生效(文章正文不受影响)。
 */
function rehypePageSections() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "p") return;
      const text = textOf(node);
      if (!text || text.length > 20 || !/[：:]$/.test(text)) return;
      const onlyLabels = node.children.every(
        (c) =>
          c.type === "text" ||
          (c.type === "element" && (c.tagName === "strong" || c.tagName === "em")),
      );
      if (!onlyLabels) return;
      node.tagName = "h2";
      if (/^免责声明/.test(text)) node.properties.dataSection = "note";
    });
  };
}

function textOf(node: Element): string {
  let out = "";
  visit(node, (child) => {
    if (child.type === "text") out += (child as { value: string }).value;
  });
  return out.trim();
}

/**
 * WordPress 经典编辑器斜体 ''文本'' → <em>:
 * WP 用双单引号表示斜体,迁移到 Markdown 后原样保留,渲染层不识别会把引号
 * 原样显示给用户(存量论坛帖等)。仅作用于正文文本节点,跳过 code/pre 等
 * 包裹(避免破坏 SQL 空串 '')。markdown 与存量 HTML 两条管线共用。
 */
function rehypeWpItalic() {
  const PATTERN = /''([^'<>\n]{1,200})''/g;
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (index == null || parent == null) return;
      if (!node.value.includes("''")) return;
      const parentEl = parent as Element;
      if (
        parentEl.type === "element" &&
        /^(code|pre|kbd|samp|script|style)$/.test(parentEl.tagName)
      ) {
        return;
      }
      PATTERN.lastIndex = 0;
      const children: (Text | Element)[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = PATTERN.exec(node.value)) !== null) {
        if (m.index > last) {
          children.push({ type: "text", value: node.value.slice(last, m.index) });
        }
        children.push({
          type: "element",
          tagName: "em",
          properties: {},
          children: [{ type: "text", value: m[1] ?? "" }],
        });
        last = m.index + m[0].length;
      }
      if (last === 0) return;
      if (last < node.value.length) {
        children.push({ type: "text", value: node.value.slice(last) });
      }
      (parent.children as (Text | Element)[]).splice(index, 1, ...children);
      return [SKIP, index + children.length];
    });
  };
}

export async function renderMarkdown(
  md: string,
  opts: {
    cdnHosts?: readonly string[];
    sections?: boolean;
    sectionAnchors?: readonly { id: string; match: RegExp }[];
  } = {},
): Promise<{ html: string; toc: TocItem[] }> {
  const toc: TocItem[] = [];
  // unified 管线(非 react-dom/server——RSC 禁运):原始 HTML 经 rehype-raw 解析为
  // 节点(存量 WP 表格/加粗不再整块丢失),sanitize 白名单兜底属性级注入
  // (javascript: 链接/事件属性),双防线不变。
  let pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    // 单换行即换行(GFM 软换行→<br>):后台编辑器按回车即生效,存量 WP 正文
    // 的逐行条目(空行在迁移期被折叠)也按行展示;中文内容无英文软折行习惯
    .use(remarkBreaks)
    // CJK 加粗闭合修复:CommonMark 对「**中文：**中文」形态不识别强调(冒号后紧跟
    // 汉字时闭合符不成 right-flanking),WP 迁移存量正文大量该形态,站点级兜底
    .use(remarkCjkFriendly)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw);
  if (opts.sections) pipeline = pipeline.use(rehypePageSections);
  pipeline = pipeline.use(rehypeWpItalic).use(rehypeHighlight).use(rehypeSlug);
  let tail = pipeline
    .use(rehypeWowhead)
    .use(rehypeLegacyLinks)
    .use(rehypeImageAllowlist, opts.cdnHosts ?? [])
    .use(rehypeSanitize, sanitizeSchema as never);
  if (opts.sectionAnchors?.length) {
    tail = tail.use(rehypeSectionAnchors, opts.sectionAnchors);
  }
  const file = await tail
    .use(rehypeCollectToc, toc)
    .use(rehypeStringify)
    .process(md);
  return { html: String(file), toc };
}

/**
 * 存量论坛 HTML 渲染(research R4):rehype-parse fragment → wowhead 标注 →
 * 图片域白名单 → 同一 sanitize 白名单 → stringify。迁移层只做图片 URL 重写,
 * XSS 白名单收口渲染层单点(R4 二次纵深),正文域白名单同 markdown。
 */
export async function renderLegacyHtml(
  html: string,
  opts: { cdnHosts?: readonly string[] } = {},
): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeWowhead)
    .use(rehypeLegacyLinks)
    .use(rehypeImageAllowlist, opts.cdnHosts ?? [])
    .use(rehypeWpItalic)
    .use(rehypeSanitize, sanitizeSchema as never)
    .use(rehypeStringify)
    .process(html);
  return String(file);
}
