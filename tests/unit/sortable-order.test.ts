import { describe, expect, it } from "vitest";
import {
  changedSorts,
  moveByIndex,
  moveToIndex,
  reconcileOrder,
} from "@/components/admin/sortable-order";

/**
 * 管理台排序原语(#79):轮播/版块共用,行为须与旧内联实现一致。
 */

describe("reconcileOrder", () => {
  it("移除已消失的 id 并追加新出现的 id", () => {
    expect(reconcileOrder(["a", "b"], ["b", "c"])).toEqual(["b", "c"]);
  });

  it("保持既有 id 的本地顺序(不按 props 重排)", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("空集合返回空数组", () => {
    expect(reconcileOrder(["a"], [])).toEqual([]);
  });
});

describe("moveByIndex", () => {
  it("上移一位", () => {
    expect(moveByIndex(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  });

  it("下移一位", () => {
    expect(moveByIndex(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("越界与未知 id 返回 null", () => {
    expect(moveByIndex(["a", "b"], "a", -1)).toBeNull();
    expect(moveByIndex(["a", "b"], "b", 1)).toBeNull();
    expect(moveByIndex(["a", "b"], "zz", 1)).toBeNull();
  });

  it("不修改入参", () => {
    const ids = ["a", "b", "c"];
    moveByIndex(ids, "a", 1);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("moveToIndex", () => {
  it("拖拽项插入到目标原下标处", () => {
    expect(moveToIndex(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("同项拖拽与目标缺失返回 null", () => {
    expect(moveToIndex(["a", "b"], "a", "a")).toBeNull();
    expect(moveToIndex(["a", "b"], "a", "zz")).toBeNull();
    expect(moveToIndex(["a", "b"], "", "a")).toBeNull();
  });
});

describe("changedSorts", () => {
  it("仅挑出 sort 与新下标不一致的条目", () => {
    const sorts = new Map([
      ["a", 0],
      ["b", 2],
      ["c", 2],
    ]);
    expect(changedSorts(["a", "b", "c"], (id) => sorts.get(id))).toEqual([{ id: "b", index: 1 }]);
  });

  it("未知 id 忽略,顺序全对齐时为空", () => {
    expect(changedSorts(["a", "zz"], (id) => (id === "a" ? 0 : undefined))).toEqual([]);
    expect(changedSorts(["a", "b"], (id) => (id === "a" ? 0 : 1))).toEqual([]);
  });
});
