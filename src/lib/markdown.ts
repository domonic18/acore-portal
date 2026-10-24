import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import { visit, SKIP } from "unist-util-visit";
import type { Element, Root } from "hast";

/**
 * Markdown 渲染管线收口(M3 research R3):
 * react-markdown + remark-gfm + rehype-highlight + rehype-slug + rehype-sanitize 白名单。
 * 原始 HTML 默认不渲染(react-markdown 无 rehype-raw),sanitize 兜底属性级注入
 * (javascript: 链接/事件属性),双防线(XSS 硬防线,宪法 VI)。
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
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? [])],
    h1: ["id"],
    h2: ["id"],
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

function textOf(node: Element): string {
  let out = "";
  visit(node, (child) => {
    if (child.type === "text") out += (child as { value: string }).value;
  });
  return out.trim();
}

export async function renderMarkdown(
  md: string,
  opts: { cdnHosts?: readonly string[] } = {},
): Promise<{ html: string; toc: TocItem[] }> {
  const toc: TocItem[] = [];
  const element = createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeHighlight,
        rehypeSlug,
        rehypeWowhead,
        [rehypeImageAllowlist, opts.cdnHosts ?? []],
        [rehypeSanitize, sanitizeSchema],
        [rehypeCollectToc, toc],
      ] as never,
    },
    md,
  );
  const html = renderToStaticMarkup(element);
  return { html, toc };
}
