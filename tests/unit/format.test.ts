import { describe, expect, it } from "vitest";
import {
  beijingDateKey,
  beijingDateTimeInput,
  beijingDayKeyCompact,
  beijingDayStart,
  displayUserName,
  formatDate,
  formatDateTime,
  formatDateTimeShort,
  formatShortDate,
  joinSegments,
  maskConnectionUrl,
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

/** 北京自然日口径:「今天/昨日/近 N 天」的日界必须与展示时区一致 */
describe("lib/format 北京自然日", () => {
  // 北京时间 2026-11-01 00:30(= UTC 2026-10-31 16:30)仍在 10-31 这个北京日
  const beijingEarlyMorning = new Date("2026-10-31T16:30:00.000Z");

  it("beijingDateKey 取北京日期,UTC 跨日不影响", () => {
    expect(beijingDateKey(beijingEarlyMorning)).toBe("2026-11-01");
    expect(beijingDateKey(new Date("2026-10-31T15:59:00.000Z"))).toBe("2026-10-31");
  });

  it("beijingDayKeyCompact 输出 YYYYMMDD", () => {
    expect(beijingDayKeyCompact(beijingEarlyMorning)).toBe("20261101");
  });

  it("beijingDayStart 返回北京日界的 UTC 瞬时", () => {
    const start = beijingDayStart(beijingEarlyMorning);
    // 北京 2026-11-01 00:00 == UTC 2026-10-31 16:00
    expect(start.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(beijingDayStart(new Date("2026-10-31T15:59:00.000Z")).toISOString()).toBe(
      "2026-10-30T16:00:00.000Z",
    );
  });
});

/** datetime-local 输入值:北京墙钟,与展示口径一致(不依赖进程本地时区) */
describe("lib/format beijingDateTimeInput", () => {
  it("瞬时折算成北京墙钟", () => {
    expect(beijingDateTimeInput(new Date("2026-10-31T16:30:00.000Z"))).toBe("2026-11-01T00:30");
    expect(beijingDateTimeInput("2026-10-31T16:30:00.000Z")).toBe("2026-11-01T00:30");
  });

  it("空值/非法值回 null", () => {
    expect(beijingDateTimeInput(null)).toBeNull();
    expect(beijingDateTimeInput(undefined)).toBeNull();
    expect(beijingDateTimeInput("")).toBeNull();
    expect(beijingDateTimeInput("not-a-date")).toBeNull();
  });
});

/** 后台用户名展示:昵称与用户名相同时不重复展示两遍 */
describe("lib/format displayUserName", () => {
  it("昵称=用户名 → 只显示一遍(不出现「x (x)」)", () => {
    expect(displayUserName({ username: "leonlaiming001", nickname: "leonlaiming001" })).toBe(
      "leonlaiming001",
    );
  });

  it("昵称不同 → 昵称在前,用户名在括号里", () => {
    expect(displayUserName({ username: "laiming001", nickname: "雷恩" })).toBe("雷恩 (laiming001)");
  });

  it("无昵称 / 空昵称 → 只显示用户名", () => {
    expect(displayUserName({ username: "laiming001", nickname: null })).toBe("laiming001");
    expect(displayUserName({ username: "laiming001", nickname: "  " })).toBe("laiming001");
  });

  it("无用户名 → 只显示昵称", () => {
    expect(displayUserName({ username: null, nickname: "雷恩" })).toBe("雷恩");
    expect(displayUserName({ username: null, nickname: null })).toBe("");
  });
});

/** 连接串脱敏:口令段换成 ***,其余(host/库名)保持可见 */
describe("lib/format maskConnectionUrl", () => {
  it("含口令 → 口令段替换为 ***", () => {
    expect(maskConnectionUrl("mysql://acore_reader:secretpw@127.0.0.1:3306/acore_characters")).toBe(
      "mysql://acore_reader:***@127.0.0.1:3306/acore_characters",
    );
  });

  it("不含口令 → 原样返回", () => {
    expect(maskConnectionUrl("mysql://acore_reader@127.0.0.1:3306/acore_characters")).toBe(
      "mysql://acore_reader@127.0.0.1:3306/acore_characters",
    );
  });

  it("非 URL → 原样返回(不抛)", () => {
    expect(maskConnectionUrl("not a url")).toBe("not a url");
    expect(maskConnectionUrl("")).toBe("");
  });
});
