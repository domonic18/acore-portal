import { describe, expect, it } from "vitest";
import { renderLegacyHtml, renderMarkdown } from "@/lib/markdown";
import {
  FORUM_POST_BODY_CLS,
  MARKDOWN_BODY_CLS,
  TUTORIAL_ANCHOR_ALIASES,
} from "@/constants/content";

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

  it("单换行渲染为 <br>(后台编辑器按回车即换行)", async () => {
    const { html } = await render("第一行\n第二行\n\n> 条目一\n> 条目二");
    expect(html).toContain("第一行<br>\n第二行");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("条目一<br>\n条目二");
  });

  it("GFM 表格与任务清单通过", async () => {
    const { html } = await render(
      "| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] 完成\n- [ ] 待办",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain('type="checkbox"');
  });

  it("单波浪线数字区间不触发删除线,~~双波浪~~ 保留(传家宝说明 60~70级)", async () => {
    const { html } = await render(
      "传家宝在60~70级的表现过于强力,所以在54~70级不会属性成长。~~旧价~~",
    );
    expect(html).not.toContain("<del>70级");
    expect(html).toContain("60~70级");
    expect(html).toContain("<del>旧价</del>");
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

  it("sectionAnchors 按标题文案覆写稳定锚点 id(教程下载区,TOC 同源)", async () => {
    const md = [
      "## 第三步： 下载客户端",
      "## 第四步：下载补丁文件",
      "## 第五步：下载登录器",
      "## 第六步：运行登录器并登录账号",
    ].join("\n\n");
    const { html, toc } = await renderMarkdown(md, {
      sectionAnchors: TUTORIAL_ANCHOR_ALIASES,
    });
    expect(html).toContain('id="client_download"');
    expect(html).toContain('id="patch_download"');
    expect(html).toContain('id="login_download"');
    expect(toc.map((t) => t.id)).toEqual([
      "client_download",
      "patch_download",
      "login_download",
      expect.stringMatching(/^user-content-/),
    ]);
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

  it("wowhead 链接自动标注 data-wowhead(含 /cn/ 语言前缀),其它外链不标注", async () => {
    const { html } = await render(
      "[雷霆之锤](https://www.wowhead.com/item=19019) 与 [坐骑](https://www.wowhead.com/cn/item=142225) 与 [首页](https://example.com)",
    );
    expect(html).toContain('data-wowhead="item=19019"');
    expect(html).toContain('data-wowhead="item=142225"');
    expect(html).not.toContain('data-wowhead="https://example.com"');
  });

  it("旧站绝对链接改写为站内相对地址,外链保持原样(issue #24)", async () => {
    const { html } = await render(
      "[积分](http://lokta.cn/?p=98) [公约](https://www.lokta.cn/wp-login.php?action=register) [站外](https://example.com/x)",
    );
    expect(html).toContain('href="/?p=98"');
    expect(html).toContain('href="/wp-login.php?action=register"');
    expect(html).toContain('href="https://example.com/x"');
  });

  it("空输入与纯文本不产生额外标签", async () => {
    const { html, toc } = await render("纯文本一行");
    expect(html).toContain("<p>纯文本一行</p>");
    expect(toc).toEqual([]);
  });

  it("存量 WP 原始 HTML 保留:表格/加粗不再整块丢失(坐骑指南等页面)", async () => {
    const { html } = await render(
      "<table><tbody><tr><td><span>坐骑名称</span></td><td>来源</td></tr></tbody></table>",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<td>");
    expect(html).toContain("坐骑名称");
    const strong = await render("<strong>原生加粗</strong>与正文");
    expect(strong.html).toContain("<strong>原生加粗</strong>");
  });

  it("原始 HTML 里的样式/脚本仍被剔除(开启原始 HTML 不放松白名单)", async () => {
    const { html } = await render(
      "<style>body{display:none}</style><div onclick=\"steal()\">正文</div>",
    );
    expect(html).not.toContain("<style");
    expect(html).not.toContain("display:none");
    expect(html).not.toContain("onclick");
    expect(html).toContain("正文");
  });

  it("WordPress ''斜体'' 转为 <em>(markdown 与存量 HTML 两条管线)", async () => {
    const md = await render("战士点出天赋 ''强化法术反射'' 生效");
    expect(md.html).toContain("<em>强化法术反射</em>");
    expect(md.html).not.toContain("''");
    const legacy = await renderLegacyHtml(
      "<p>战士点出天赋 ''强化法术反射'' 生效</p>",
    );
    expect(legacy).toContain("<em>强化法术反射</em>");
  });

  it("'' 斜体转换不误伤代码块与 SQL 空串", async () => {
    const code = await render("```\nSELECT * FROM x WHERE name = '';\n```");
    expect(code.html).toContain("name = '';");
    expect(code.html).not.toContain("<em>");
    const legacy = await renderLegacyHtml("<p>INSERT INTO x VALUES (1, '');</p>");
    expect(legacy).toContain("''");
    expect(legacy).not.toContain("<em>");
  });

  it("排版基线类名含强调/列表标记规则(全站 Markdown 统一口径)", () => {
    expect(MARKDOWN_BODY_CLS).toContain("[&_strong]");
    expect(MARKDOWN_BODY_CLS).toContain("list-decimal");
    expect(MARKDOWN_BODY_CLS).toContain("list-disc");
    expect(FORUM_POST_BODY_CLS).toContain("[&_strong]");
  });
});

describe("存量 WP 正文换行还原(renderLegacyHtml,wpautop 换行子集)", () => {
  // 快照库真实形态(公告帖):<p> 与 <blockquote> 块间换行不产生 <br>,
  // 块内 </strong>：⏎⏎<strong> 的换行必须还原为分行
  const WP_SAMPLE = [
    "<p>问题提交格式：</p>",
    '<blockquote><strong>问题标题(必填)</strong>：',
    "",
    "<strong>问题详细描述(必填)：</strong>",
    "",
    "<strong>附带说明(可选)</strong>：</blockquote>",
    "<p>例如：</p>",
  ].join("\n");

  it("块内换行转 <br>(双换行=空行),块级标签紧邻换行不产生 <br>", async () => {
    const legacy = await renderLegacyHtml(WP_SAMPLE);
    expect(legacy).toMatch(/<\/strong>：(<br\s*\/?>\s*){2}<strong>/);
    expect(legacy).not.toMatch(/<\/p>\s*<br/);
    expect(legacy).not.toMatch(/<br\s*\/?>\s*<blockquote/);
    expect(legacy).not.toMatch(/<\/blockquote>\s*<br/);
    expect(legacy).not.toMatch(/<br\s*\/?>\s*<p>/);
  });

  it("单换行同样分行(WP wpautop $br=true 同口径)", async () => {
    const legacy = await renderLegacyHtml("<p>第一步\n第二步\n第三步</p>");
    expect(legacy).toMatch(/第一步<br\s*\/?>\s*第二步<br\s*\/?>\s*第三步/);
  });

  it("<pre> 代码块内换行保持原样,不注入 <br>", async () => {
    const legacy = await renderLegacyHtml("<p>代码：</p>\n<pre>SELECT 1;\nSELECT 2;</pre>");
    expect(legacy).toContain("<pre>SELECT 1;\nSELECT 2;</pre>");
    expect(legacy).not.toContain("SELECT 1;<br");
    // pre 前的换行是块级邻接,不产生 <br>
    expect(legacy).not.toMatch(/<\/p>\s*<br/);
  });

  it("无换行内容原样直通", async () => {
    const legacy = await renderLegacyHtml("<p>单行正文</p>");
    expect(legacy).toContain("<p>单行正文</p>");
    expect(legacy).not.toContain("<br");
  });
});
