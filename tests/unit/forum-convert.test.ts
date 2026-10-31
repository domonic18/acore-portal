import { describe, expect, it } from "vitest";
import {
  BOARD_SLUGS,
  byEarlyOrder,
  floorOfReply,
  MAIN_POST_FLOOR,
  stripStatusPrefix,
  visibleFromStatus,
} from "../../scripts/migrate/lib/forum-convert.mjs";

/**
 * T035 US5 论坛转换器单测(Q3/R4/R5):
 * 状态前缀剥离(【规范】【已解决】【已关闭】→statusLabel+净标题,剥离失败保留原文)、
 * 楼层分配(早序 floor 连续、1=主贴)、存量状态可见性、版块 slug 映射。
 */
describe("stripStatusPrefix(T035 Q3)", () => {
  it("三种已知前缀剥离为 statusLabel+净标题", () => {
    expect(stripStatusPrefix("【规范】置顶规范帖")).toEqual({
      label: "standard",
      title: "置顶规范帖",
    });
    expect(stripStatusPrefix("【已解决】 幻化问题")).toEqual({
      label: "resolved",
      title: "幻化问题",
    });
    expect(stripStatusPrefix("【已关闭】旧站签到楼")).toEqual({
      label: "closed",
      title: "旧站签到楼",
    });
  });

  it("未知前缀(存量高频【已处理】等)与无前缀保留原文+none", () => {
    expect(stripStatusPrefix("【已处理】账号被误封")).toEqual({
      label: "none",
      title: "【已处理】账号被误封",
    });
    expect(stripStatusPrefix("【测试结果】AzerotCore 测试")).toEqual({
      label: "none",
      title: "【测试结果】AzerotCore 测试",
    });
    expect(stripStatusPrefix("普通标题")).toEqual({ label: "none", title: "普通标题" });
  });

  it("剥离失败(净标题为空/null)保留原文", () => {
    expect(stripStatusPrefix("【已解决】")).toEqual({ label: "none", title: "【已解决】" });
    expect(stripStatusPrefix("【已解决】   ")).toEqual({
      label: "none",
      title: "【已解决】   ",
    });
    expect(stripStatusPrefix(null)).toEqual({ label: "none", title: "" });
  });
});

describe("楼层分配(T035 R4)", () => {
  it("主贴固定 1,回复按早序连续 2..n(同秒按 ID 升序)", () => {
    const rows = [
      { id: 30, created_at: new Date("2024-01-03T00:00:00Z") },
      { id: 10, created_at: new Date("2024-01-01T00:00:00Z") },
      { id: 20, created_at: new Date("2024-01-02T00:00:00Z") },
      { id: 15, created_at: new Date("2024-01-02T00:00:00Z") },
    ];
    const sorted = [...rows].sort(byEarlyOrder);
    expect(sorted.map((r) => r.id)).toEqual([10, 15, 20, 30]);
    expect(sorted.map((_, i) => floorOfReply(i))).toEqual([2, 3, 4, 5]);
    expect(MAIN_POST_FLOOR).toBe(1); // 1=主贴
  });
});

describe("可见性与版块映射(T035)", () => {
  it("publish/closed 可见,draft/pending/spam/trash 软隐藏", () => {
    expect(visibleFromStatus("publish")).toBe(true);
    expect(visibleFromStatus("closed")).toBe(true);
    for (const s of ["draft", "pending", "spam", "trash"]) {
      expect(visibleFromStatus(s)).toBe(false);
    }
  });

  it("版块 slug 映射覆盖存量 5 版块", () => {
    expect(Object.keys(BOARD_SLUGS).map(Number).sort((a, b) => a - b)).toEqual([
      588, 637, 1136, 1264, 2968,
    ]);
    expect(Object.values(BOARD_SLUGS)).toEqual([
      "feedback",
      "share",
      "appeal",
      "report",
      "strategy",
    ]);
  });
});
