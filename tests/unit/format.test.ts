import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDateTimeShort,
  formatShortDate,
  joinSegments,
} from "@/lib/format";

/** 日期展示统一东八区:UTC 切分会把北京时间 00:00-08:00 算到前一天 */
describe("lib/format 东八区口径", () => {
  // 2026-10-31T17:30Z = 北京时间 2026-11-01 01:30
  const crossingMidnight = new Date("2026-10-31T17:30:00.000Z");

  it("formatDate 按北京时间取日期,不受 UTC 跨日影响", () => {
    expect(formatDate(crossingMidnight)).toBe("2026-11-01");
    expect(formatDate(crossingMidnight.toISOString())).toBe("2026-11-01");
  });

  it("formatShortDate 输出 MM-DD", () => {
    expect(formatShortDate(crossingMidnight)).toBe("11-01");
  });

  it("formatDateTimeShort 输出 YYYY-MM-DD HH:mm,零点为 00:00", () => {
    expect(formatDateTimeShort(crossingMidnight)).toBe("2026-11-01 01:30");
    expect(formatDateTimeShort(new Date("2026-10-31T16:00:00.000Z"))).toBe("2026-11-01 00:00");
  });

  it("formatDateTime 保持中文口径", () => {
    expect(formatDateTime(crossingMidnight.toISOString())).toBe("2026/11/01 01:30");
  });
});

/** 页脚版权行分段拼接:留空段(后台清空=前台不显示)不参与,且不留多余分隔符 */
describe("lib/format joinSegments", () => {
  it("全段齐全 → 以 · 连接", () => {
    expect(
      joinSegments(["© 2026 老克塔 LoktaCN", "怀旧公益项目(非营利)"]),
    ).toBe("© 2026 老克塔 LoktaCN · 怀旧公益项目(非营利)");
  });

  it("副标题留空 → 该段不拼,不留多余分隔符", () => {
    expect(joinSegments(["© 2026 老克塔 LoktaCN", ""])).toBe("© 2026 老克塔 LoktaCN");
    expect(joinSegments(["© 2026 老克塔 LoktaCN", null])).toBe("© 2026 老克塔 LoktaCN");
    expect(joinSegments(["© 2026 老克塔 LoktaCN", undefined])).toBe("© 2026 老克塔 LoktaCN");
  });

  it("空白段按未配置处理(不留空槽)", () => {
    expect(joinSegments(["© 2026", "   "])).toBe("© 2026");
  });

  it("全空 → 空串", () => {
    expect(joinSegments(["", null, undefined])).toBe("");
  });
});
