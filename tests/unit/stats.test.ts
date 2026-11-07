import { describe, expect, it } from "vitest";
import {
  ARCHIVE_BROWSER_LABEL,
  ARCHIVE_DEVICE_LABEL,
  ARCHIVE_PLATFORM_LABEL,
  archiveCountryLabel,
  archiveDimensionLabel,
  isSearchEngineHost,
  parseStatsRange,
  STATS_RANGE_DEFAULT,
  STATS_RANGE_DAYS,
  STATS_RANGE_KEYS,
  STATS_RANGE_LABEL,
} from "@/constants/stats";
import {
  normalizeSearchTerm,
  parseSearchTerm,
} from "@/server/services/stats/archive";
import {
  bucketTimeline,
  pickBucketDays,
} from "@/server/services/stats/overview";

/**
 * 数据看板纯函数单测(2026-11-07 看板重构):
 * 区间口径解析、存档维度归一化、搜索词解析、时间线分桶。
 */

describe("parseStatsRange", () => {
  it("合法值原样返回", () => {
    for (const key of STATS_RANGE_KEYS) {
      expect(parseStatsRange(key)).toBe(key);
    }
  });

  it("非法/缺省回落默认区间", () => {
    expect(parseStatsRange(undefined)).toBe(STATS_RANGE_DEFAULT);
    expect(parseStatsRange("")).toBe(STATS_RANGE_DEFAULT);
    expect(parseStatsRange("365d")).toBe(STATS_RANGE_DEFAULT);
  });

  it("区间键与天数/展示名一一对应", () => {
    for (const key of STATS_RANGE_KEYS) {
      expect(STATS_RANGE_LABEL[key]).toBeTruthy();
    }
    for (const key of STATS_RANGE_KEYS.filter((k) => k !== "all")) {
      expect(STATS_RANGE_DAYS[key]).toBeTypeOf("number");
    }
    expect(STATS_RANGE_DAYS.all).toBeNull();
  });
});

describe("isSearchEngineHost", () => {
  it("识别主流搜索引擎域名与子域", () => {
    expect(isSearchEngineHost("www.baidu.com")).toBe(true);
    expect(isSearchEngineHost("baidu.com")).toBe(true);
    expect(isSearchEngineHost("m.sm.cn")).toBe(true);
    expect(isSearchEngineHost("www.google.com")).toBe(true);
    expect(isSearchEngineHost("cn.bing.com")).toBe(true);
  });

  it("非搜索引擎域名不误判", () => {
    expect(isSearchEngineHost("news.example.com")).toBe(false);
    expect(isSearchEngineHost("lokta.cn")).toBe(false);
    expect(isSearchEngineHost("notbaidu.com")).toBe(false);
  });
});

describe("archiveCountryLabel / archiveDimensionLabel", () => {
  it("国家码映射为中文,未知码原样保留", () => {
    expect(archiveCountryLabel("CN")).toBe("中国");
    expect(archiveCountryLabel("us")).toBe("美国");
    expect(archiveCountryLabel("ZZ")).toBe("ZZ");
  });

  it("空值/占位符归「未知」", () => {
    expect(archiveCountryLabel(null)).toBe("未知");
    expect(archiveCountryLabel("")).toBe("未知");
    expect(archiveCountryLabel("000")).toBe("未知");
    expect(archiveDimensionLabel("??", ARCHIVE_DEVICE_LABEL)).toBe("未知");
    expect(archiveDimensionLabel("", ARCHIVE_PLATFORM_LABEL)).toBe("未知");
  });

  it("命中映射表用映射值,其余原样保留", () => {
    expect(archiveDimensionLabel("desktop", ARCHIVE_DEVICE_LABEL)).toBe("桌面端");
    expect(archiveDimensionLabel("OS X", ARCHIVE_PLATFORM_LABEL)).toBe("macOS");
    expect(archiveDimensionLabel("Chrome", ARCHIVE_BROWSER_LABEL)).toBe("Chrome");
    expect(archiveDimensionLabel("SomeNewBrowser", ARCHIVE_BROWSER_LABEL)).toBe(
      "SomeNewBrowser",
    );
  });
});

describe("normalizeSearchTerm", () => {
  it("去首尾引号/波浪号后保留", () => {
    expect(normalizeSearchTerm('"怀旧服"')).toBe("怀旧服");
    expect(normalizeSearchTerm("~怀旧服~")).toBe("怀旧服");
    expect(normalizeSearchTerm("  怀旧服  ")).toBe("怀旧服");
  });

  it("过短丢弃,超长截断", () => {
    expect(normalizeSearchTerm("a")).toBeNull();
    expect(normalizeSearchTerm("ab")).toBeNull();
    expect(normalizeSearchTerm("x".repeat(60))).toBe("x".repeat(40));
  });

  it("字母+数字混排的随机串丢弃,正常英文词保留", () => {
    expect(normalizeSearchTerm("battleq4v")).toBeNull();
    expect(normalizeSearchTerm("azerothcore")).toBe("azerothcore");
    expect(normalizeSearchTerm("wow head")).toBe("wow head");
  });
});

describe("parseSearchTerm", () => {
  it("从百度 wd / 多数引擎 q 解析搜索词", () => {
    expect(parseSearchTerm("https://www.baidu.com/s?wd=怀旧服开服")).toBe("怀旧服开服");
    expect(parseSearchTerm("https://www.google.com/search?q=azerothcore")).toBe(
      "azerothcore",
    );
  });

  it("缺协议头时补全后解析", () => {
    expect(parseSearchTerm("www.baidu.com/s?wd=怀旧服")).toBe("怀旧服");
  });

  it("非搜索引擎/无参数/垃圾词返回 null", () => {
    expect(parseSearchTerm("https://news.example.com/a?wd=怀旧服")).toBeNull();
    expect(parseSearchTerm("https://www.baidu.com/s?ie=utf-8")).toBeNull();
    expect(parseSearchTerm("https://www.baidu.com/s?wd=battleq4v")).toBeNull();
    expect(parseSearchTerm("")).toBeNull();
    expect(parseSearchTerm("not a url")).toBeNull();
  });
});

describe("pickBucketDays", () => {
  it("按跨度选粒度:短区间按日、中等按周、更长按月", () => {
    expect(pickBucketDays(7)).toBe(1);
    expect(pickBucketDays(120)).toBe(1);
    expect(pickBucketDays(121)).toBe(7);
    expect(pickBucketDays(800)).toBe(7);
    expect(pickBucketDays(801)).toBe(30);
  });
});

describe("bucketTimeline", () => {
  const daily = [
    { date: "2026-11-01", pv: 10, uv: 5 },
    { date: "2026-11-02", pv: 20, uv: 8 },
    { date: "2026-11-08", pv: 30, uv: 12 },
  ];

  it("按日粒度原样返回", () => {
    expect(bucketTimeline(daily, 1)).toEqual(daily);
  });

  it("按周分桶:桶内累加,日期取桶内首日,结果按日期升序", () => {
    const bucketed = bucketTimeline(daily, 7);
    expect(bucketed).toEqual([
      { date: "2026-11-01", pv: 30, uv: 13 },
      { date: "2026-11-08", pv: 30, uv: 12 },
    ]);
  });

  it("空输入返回空数组", () => {
    expect(bucketTimeline([], 7)).toEqual([]);
  });
});
