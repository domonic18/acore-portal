import { describe, expect, it } from "vitest";
import {
  buildBooleanQuery,
  extractSnippet,
  extractTerms,
  highlightParts,
  stripMarkdown,
} from "@/server/services/search/highlight";

/**
 * 站内搜索纯函数层锚死:查询清洗/布尔串/Markdown 剥离/片段提取/高亮切分。
 * 这些函数是 FULLTEXT 查询构造与前台高亮渲染的唯一口径(W6 Agent 引用片段同源)。
 */
describe("extractTerms 查询切词", () => {
  it("按空白切词、去大小写重复", () => {
    expect(extractTerms("天赋  天赋 TALENT")).toEqual(["天赋", "TALENT"]);
  });

  it("剥引号与反斜杠(BOOLEAN MODE 短语包裹防破义)", () => {
    expect(extractTerms('"矿石"')).toEqual(["矿石"]);
    expect(extractTerms('a\\b')).toEqual(["ab"]);
  });

  it("空词/纯空白返回空数组", () => {
    expect(extractTerms("   ")).toEqual([]);
  });

  it("限 8 词:超出截断", () => {
    const terms = extractTerms("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10");
    expect(terms).toHaveLength(8);
    expect(terms[7]).toBe("h8");
  });

  it("单词限 32 字符", () => {
    const long = "字".repeat(40);
    expect(extractTerms(long)[0]).toHaveLength(32);
  });
});

describe("buildBooleanQuery 布尔串构造", () => {
  it("短语包裹(中文短语是 ngram 可匹配单元)", () => {
    expect(buildBooleanQuery(["矿石", "暮色森林"])).toBe('"矿石" "暮色森林"');
  });

  it("过滤长度<2 且无字母数字的纯符号词", () => {
    expect(buildBooleanQuery(["!", "。", "ab"])).toBe('"ab"');
  });

  it("全部无效词返回空串(调用方视为无查询)", () => {
    expect(buildBooleanQuery(["!", "。"])).toBe("");
    expect(buildBooleanQuery([])).toBe("");
  });
});

describe("stripMarkdown Markdown 剥离", () => {
  it("剥代码块/图片/链接/HTML 标签/标题井号/强调标记", () => {
    const md = [
      "# 标题",
      "![封面](https://example.com/a.png)",
      "[链接文字](https://example.com)",
      "**加粗**与`代码`",
      "```js\nconst x = 1;\n```",
      "<span>行内标签</span>",
      "- 列表项",
      "正文段落。",
    ].join("\n");
    const out = stripMarkdown(md);
    expect(out).toContain("标题");
    expect(out).toContain("链接文字");
    expect(out).toContain("加粗");
    expect(out).toContain("正文段落");
    expect(out).not.toContain("https://");
    expect(out).not.toContain("const x");
    expect(out).not.toContain("<span>");
    expect(out).not.toContain("**");
    expect(out).not.toContain("# ");
    expect(out).not.toContain("- ");
  });

  it("空白归一:连续空白折叠为单空格", () => {
    expect(stripMarkdown("a\n\n  b\tc")).toBe("a b c");
  });
});

describe("extractSnippet 命中片段", () => {
  it("取最早命中位置,向两侧扩展并补省略号", () => {
    const text = "前".repeat(80) + "矿石" + "后".repeat(200);
    const snippet = extractSnippet(text, ["矿石"], 20);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("矿石");
    // 中心命中 ± 20 字符
    expect(snippet.length).toBeLessThan(60);
  });

  it("命中位于开头时无前省略号", () => {
    const snippet = extractSnippet("矿石在开头" + "x".repeat(200), ["矿石"], 10);
    expect(snippet.startsWith("矿石")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("无命中回落开头截断(长文本补省略号)", () => {
    const snippet = extractSnippet("abc" + "x".repeat(300), ["矿石"], 10);
    expect(snippet.startsWith("…abc")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    // 文本足够短时原样返回
    expect(extractSnippet("abcdef", ["矿石"], 10)).toBe("abcdef");
  });

  it("多词取最早出现的词定位", () => {
    const text = "aaaa 暮色 bbbb 矿石 cccc";
    const snippet = extractSnippet(text, ["矿石", "暮色"], 5);
    expect(snippet).toContain("暮色");
  });
});

describe("highlightParts 高亮切分", () => {
  it("命中段标记 hit,其余纯文本,顺序保持", () => {
    const parts = highlightParts("玄晶矿石与矿石粉末", ["矿石"]);
    expect(parts).toEqual([
      { text: "玄晶", hit: false },
      { text: "矿石", hit: true },
      { text: "与", hit: false },
      { text: "矿石", hit: true },
      { text: "粉末", hit: false },
    ]);
  });

  it("多词时最靠前的命中先切(位置优先,同位置长词优先)", () => {
    const parts = highlightParts("暮色森林的矿石", ["矿石", "暮色森林"]);
    expect(parts[0]).toEqual({ text: "暮色森林", hit: true });
    expect(parts.at(-1)).toEqual({ text: "矿石", hit: true });
  });

  it("大小写不敏感命中", () => {
    const parts = highlightParts("Talent Tree", ["talent"]);
    expect(parts[0]).toEqual({ text: "Talent", hit: true });
  });

  it("无命中返回单段纯文本", () => {
    expect(highlightParts("普通文本", ["矿石"])).toEqual([
      { text: "普通文本", hit: false },
    ]);
  });

  it("空文本返回空数组(渲染零节点)", () => {
    expect(highlightParts("", ["矿石"])).toEqual([]);
  });
});
