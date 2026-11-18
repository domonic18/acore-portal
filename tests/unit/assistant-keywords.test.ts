import { describe, expect, it } from "vitest";

import {
  extractQuestionKeywords,
  mergeKeywordCounts,
  topKeywords,
} from "@/server/services/assistant/keywords";

/**
 * 提问脱敏抽词口径(M9 W8):只落聚合词、不落正文。
 */

describe("extractQuestionKeywords", () => {
  it("中文短句取整串(剔功能字)", () => {
    const tokens = extractQuestionKeywords("法师怎么升级");
    expect(tokens).toContain("法师升级");
    expect(tokens).not.toContain("怎么");
  });

  it("中文长句拆二元片段", () => {
    const tokens = extractQuestionKeywords("怀旧服猎人升级需要哪些装备和饰品");
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.every((t) => t.length === 2)).toBe(true);
  });

  it("纯虚词问题抽不出词", () => {
    expect(extractQuestionKeywords("你好")).toEqual([]);
    expect(extractQuestionKeywords("什么")).toEqual([]);
  });

  it("含数字/联系方式的片段丢弃", () => {
    const tokens = extractQuestionKeywords("我的账号 12345678 怎么升级");
    expect(tokens.every((t) => !/\d/.test(t))).toBe(true);
  });

  it("英文按词保留并小写", () => {
    expect(extractQuestionKeywords("How to gear UP")).toContain("gear");
  });

  it("空输入返回空数组", () => {
    expect(extractQuestionKeywords(null)).toEqual([]);
    expect(extractQuestionKeywords("")).toEqual([]);
  });

  it("单次抽词上限 10", () => {
    const tokens = extractQuestionKeywords(
      "怀旧服猎人升级需要哪些装备和饰品还有副本掉落以及世界首领打法攻略合集",
    );
    expect(tokens.length).toBeLessThanOrEqual(10);
  });
});

describe("mergeKeywordCounts / topKeywords", () => {
  it("合并计数并累加", () => {
    const merged = mergeKeywordCounts({ 法师升级: 1 }, ["法师升级", "副本"]);
    expect(merged).toEqual({ 法师升级: 2, 副本: 1 });
  });

  it("TopN 按次数降序,同次数按词序稳定", () => {
    const top = topKeywords({ a: 2, b: 2, c: 5 }, 2);
    expect(top).toEqual([
      { keyword: "c", count: 5 },
      { keyword: "a", count: 2 },
    ]);
  });
});
