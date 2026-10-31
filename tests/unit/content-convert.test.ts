import { describe, expect, it } from "vitest";
import {
  createConverter,
  decodeSlug,
  extractExcerpt,
  normalizeWowheadShortcodes,
  parseCnDate,
  parseProgressionBlocks,
} from "../../scripts/migrate/lib/content-convert.mjs";

/**
 * T011 US2 内容转换器单测(research R1):
 * 图片 URL 经注入查找重写(image_asset_map)、wowhead 短代码规范化、
 * 空/畸形 slug 回退 legacy-{id}、excerpt 纯文本截取 500、渐进区块解析。
 */

function block(heading: string, attrs: Record<string, unknown> = {}) {
  return `<!-- wp:cp-timeline/content-timeline-block-child ${JSON.stringify({
    time_heading: heading,
    icon: "FaRegCheckCircle",
    t_date: "2023年1月1日",
    time_desc: "<p>团本：</p>",
    block_id: "b1",
    ...attrs,
  })} -->`;
}

describe("decodeSlug(T011)", () => {
  it("URL 编码中文 slug 解码", () => {
    expect(decodeSlug("%e9%a1%b9%e7%9b%ae%e7%ae%80%e4%bb%8b", 135)).toBe("项目简介");
    expect(decodeSlug("sample-page", 2)).toBe("sample-page");
  });

  it("空/畸形回退 legacy-{id}", () => {
    expect(decodeSlug(null, 99)).toBe("legacy-99");
    expect(decodeSlug("", 99)).toBe("legacy-99");
    expect(decodeSlug("%zz%e4%b8%ad", 99)).toBe("legacy-99");
  });
});

describe("htmlToMarkdown(T011)", () => {
  it("标题/加粗/列表/链接 转 Markdown", () => {
    const md = createConverter()(
      "<h2>规则</h2><p><strong>严禁</strong>外挂,详见<a href='https://lokta.cn/?page_id=1407'>协议</a></p><ul><li>一</li><li>二</li></ul>",
    );
    expect(md).toContain("## 规则");
    expect(md).toContain("**严禁**");
    expect(md).toMatch(/- +一/);
    expect(md).toContain("[协议](https://lokta.cn/?page_id=1407)");
  });

  it("图片 src 经注入查找重写,未命中保留原 URL", () => {
    const md = createConverter((src) =>
      src.includes("2023/01") ? "https://cos.example/i.png" : undefined,
    )(
      '<img src="http://lokta.cn/wp-content/uploads/2023/01/a.png" alt="图A" /><img src="http://lokta.cn/wp-content/uploads/2024/06/b.png" alt="图B" />',
    );
    expect(md).toContain("![图A](https://cos.example/i.png)");
    expect(md).toContain(
      "![图B](http://lokta.cn/wp-content/uploads/2024/06/b.png)",
    );
  });
});

describe("normalizeWowheadShortcodes(T011)", () => {
  it("[item=N]/[spell=N] 规范化为标准链接;既有 Markdown 不误伤", () => {
    const out = normalizeWowheadShortcodes(
      "掉落 [item=19019] 与 [spell=1],另见 [雷霆之锤](https://www.wowhead.com/item=19019)",
    );
    expect(out).toContain("[item=19019](https://www.wowhead.com/item=19019)");
    expect(out).toContain("[spell=1](https://www.wowhead.com/spell=1)");
    expect(out.match(/item=19019/g)).toHaveLength(3);
  });
});

describe("extractExcerpt(T011)", () => {
  it("标签剥离+实体解码+CJK 邻接空格压缩", () => {
    expect(extractExcerpt("<p>你好&nbsp;<b>世界</b>&amp;再见</p>")).toBe(
      "你好世界&再见",
    );
    expect(extractExcerpt("<p>item one and two</p>")).toBe("item one and two");
  });

  it("超长截取 500(码点安全)", () => {
    const long = `<p>${"龙".repeat(600)}</p>`;
    const out = extractExcerpt(long);
    expect(out).toHaveLength(500);
    expect(out).toBe("龙".repeat(500));
  });
});

describe("parseProgressionBlocks(T011)", () => {
  it("开放/未定档节点解析,To be continued 剔除,日期规范化", () => {
    const html = [
      block("60级阶段 – 初始阶段"),
      block("71-74级阶段 – 诺森德开放", {
        icon: null,
        t_date: null,
        time_desc: "<p>诺森德。</p>",
        block_id: "b2",
      }),
      block("To be continued", { icon: null, t_date: null }),
      "<!-- wp:cp-timeline/content-timeline-block-child {broken json -->",
    ].join("\n");
    const nodes = parseProgressionBlocks(html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      heading: "60级阶段 – 初始阶段",
      date: "2023-01-01",
      open: true,
      blockId: "b1",
    });
    expect(nodes[1]).toMatchObject({
      heading: "71-74级阶段 – 诺森德开放",
      date: null,
      open: false,
    });
  });
});

describe("parseCnDate(T011)", () => {
  it("中文日期规范化,非法返回 null", () => {
    expect(parseCnDate("2023年1月1日")).toBe("2023-01-01");
    expect(parseCnDate("2024年12月25日")).toBe("2024-12-25");
    expect(parseCnDate("待定")).toBeNull();
    expect(parseCnDate(null)).toBeNull();
    expect(parseCnDate(42)).toBeNull();
  });
});
