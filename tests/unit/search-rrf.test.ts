import { describe, expect, it } from "vitest";
import { rrfFuse, rrfRank } from "@/server/services/search/rrf";

/**
 * RRF 融合纯函数锚死(spec §19 口径:k=60,score=Σ1/(k+rank),rank 从 1 起)。
 * FULLTEXT 路与语义路候选在组内按此融合,顺序直接决定 /search 结果序。
 */
describe("rrfFuse", () => {
  it("单路分数 = 1/(k+rank):首名 1/61", () => {
    const scores = rrfFuse(["a", "b"]);
    expect(scores.get("a")).toBeCloseTo(1 / 61);
    expect(scores.get("b")).toBeCloseTo(1 / 62);
  });

  it("两路同 id 分数叠加(双路命中=最强信号)", () => {
    const scores = rrfFuse(["a", "b"], ["b", "c"]);
    const ab = scores.get("a")!;
    const bb = scores.get("b")!;
    const cb = scores.get("c")!;
    expect(bb).toBeCloseTo(1 / 62 + 1 / 61);
    expect(bb).toBeGreaterThan(ab);
    expect(ab).toBeCloseTo(cb); // a(路1第1)与 c(路2第2)同分
  });

  it("三路叠加", () => {
    const scores = rrfFuse(["x"], ["x"], ["x"]);
    expect(scores.get("x")).toBeCloseTo(3 / 61);
  });

  it("空列表返回空映射", () => {
    expect([...rrfFuse([]).entries()]).toEqual([]);
    expect([...rrfFuse([], []).entries()]).toEqual([]);
  });
});

describe("rrfRank", () => {
  it("按融合分数降序;双路命中者排最前", () => {
    const scores = rrfFuse(["a", "b", "c"], ["b"]);
    expect(rrfRank(scores)).toEqual(["b", "a", "c"]);
  });

  it("并列分数保持插入序稳定", () => {
    const scores = rrfFuse(["p", "q"]);
    expect(rrfRank(scores)).toEqual(["p", "q"]);
  });
});
