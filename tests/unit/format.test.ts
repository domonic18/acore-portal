import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDateTimeShort, formatShortDate } from "@/lib/format";

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
