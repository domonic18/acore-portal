import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

/**
 * T008 MD 渲染管线单测(R3/R3b):
 * XSS 双防线(无 rehype-raw + sanitize 白名单)、GFM/高亮、TOC 同源、图片域白名单、wowhead 标注。
 */

async function render(md: string, cdnHosts?: readonly string[]) {
  return renderMarkdown(md, cdnHosts ? { cdnHosts } : {});
}

describe("markdown 渲染管线(T008)", () => {
  it("恶意 HTML 注入被剥离:script/style/iframe/onclick(R3 XSS 硬防线)", async () => {
    const { html } = await render(
      [
        "前文<script>alert(1)</script>后文",
        "<style>body{display:none}</style>",
        '<iframe src="https://evil.example"></iframe>',
        '<a href="https://ok.example" onclick="steal()">链接</a>',
        '<img src="https://ok.example/x.png" onerror="boom()">',
      ].join("\n"),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).toContain("前文");
    expect(html).toContain("后文");
  });

  it("javascript: 链接被剥为纯文本 href", async () => {
    const { html } = await render("[点我](javascript:alert(document.cookie))");
    expect(html).not.toContain("javascript:");
  });

  it("GFM 表格与任务清单通过", async () => {
    const { html } = await render(
      "| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] 完成\n- [ ] 待办",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain('type="checkbox"');
  });

  it("代码块高亮语言 class 通过,任意 class/裸 HTML 不通过", async () => {
    const { html } = await render(
      "```lua\nprint('hi')\n```\n\n<span class=\"evil\">x</span>",
    );
    expect(html).toContain('class="language-lua"');
    expect(html).toContain('class="hljs-built_in"');
    expect(html).not.toMatch(/<span class="evil"/);
  });

  it("TOC 仅收 h2-h4 且 id 与渲染产物一致", async () => {
    const md = "# 主标题\n\n## 二级\n\n### 三级\n\n#### 四级\n\n##### 五级";
    const { html, toc } = await render(md);
    expect(toc.map((t) => [t.depth, t.text] as const)).toEqual([
      [2, "二级"],
      [3, "三级"],
      [4, "四级"],
    ]);
    for (const item of toc) {
      expect(html).toContain(`id="${item.id}"`);
    }
  });

  it("图片域白名单:站内相对路径通过,白名单域通过,外域整节点移除", async () => {
    const { html } = await render(
      [
        "![a](/static/a.png)",
        "![b](https://cdn.example.local/b.png)",
        "![c](https://evil.example/c.png)",
      ].join("\n"),
      ["cdn.example.local"],
    );
    expect(html).toContain('src="/static/a.png"');
    expect(html).toContain("https://cdn.example.local/b.png");
    expect(html).not.toContain("evil.example");
  });

  it("wowhead 链接自动标注 data-wowhead,其它外链不标注", async () => {
    const { html } = await render(
      "[雷霆之锤](https://www.wowhead.com/item=19019) 与 [首页](https://example.com)",
    );
    expect(html).toContain('data-wowhead="item=19019"');
    expect(html).not.toContain('data-wowhead="https://example.com"');
  });

  it("空输入与纯文本不产生额外标签", async () => {
    const { html, toc } = await render("纯文本一行");
    expect(html).toContain("<p>纯文本一行</p>");
    expect(toc).toEqual([]);
  });
});
