import { describe, expect, it } from "vitest";
import { paginate } from "@/lib/pagination";

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
