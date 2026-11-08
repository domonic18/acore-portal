import { describe, expect, it } from "vitest";
import { pageSlice, paginate, totalPageCount } from "@/lib/pagination";

describe("paginate", () => {
  it("空集与整页边界", () => {
    expect(paginate(0, 1, 10)).toEqual({ totalPages: 1, skip: 0, take: 10 });
    expect(paginate(10, 1, 10)).toEqual({ totalPages: 1, skip: 0, take: 10 });
    expect(paginate(11, 2, 10)).toEqual({ totalPages: 2, skip: 10, take: 10 });
  });

  it("不夹取页码,越界由调用方自行收敛", () => {
    expect(paginate(5, 9, 10)).toEqual({ totalPages: 1, skip: 80, take: 10 });
  });
});

describe("pageSlice / totalPageCount", () => {
  it("切片不依赖总数(count 与 findMany 可并行)", () => {
    expect(pageSlice(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(pageSlice(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it("总页数按行数与页长推导,空集仍为 1 页", () => {
    expect(totalPageCount(0, 20)).toBe(1);
    expect(totalPageCount(20, 20)).toBe(1);
    expect(totalPageCount(21, 20)).toBe(2);
  });

  it("与 paginate 同源:切片与总页数口径一致", () => {
    for (const [total, page, size] of [
      [0, 1, 10],
      [11, 2, 10],
      [95, 5, 20],
    ] as const) {
      const full = paginate(total, page, size);
      expect(full.skip).toBe(pageSlice(page, size).skip);
      expect(full.take).toBe(pageSlice(page, size).take);
      expect(full.totalPages).toBe(totalPageCount(total, size));
    }
  });
});
