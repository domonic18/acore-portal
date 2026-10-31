import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getSpiderSummary,
  getTrafficSource,
  getTrafficTrend,
} from "@/server/services/stats/traffic";

/**
 * 流量与 SEO 分析(二期迭代):聚合 wp_legacy 存档三表。
 * 集成测试向 wp_legacy 写入 RUN 标记 fixture(业务连接用户有 *.* 写权限,见 dev 库 grants),
 * 经 since 时间窗(未来 2099 日期)隔离真实存档数据 → 断言精确聚合 → 按标记清理。
 * 未来日期避开真实存档(2022-2026)且不撞 date 唯一键。
 */
const RUN = Date.now().toString(36).slice(-6);
const SRC_A = `ntsrc-a-${RUN}`;
const SRC_B = `ntsrc-b-${RUN}`;
const DEV = `ntdev-${RUN}`;
const PLAT = `ntplat-${RUN}`;
const URL_A = `http://test.local/nt404-a-${RUN}`;
const URL_B = `http://test.local/nt404-b-${RUN}`;
const URL_C = `http://test.local/nt200-${RUN}`;
const D1 = "2099-06-01";
const D2 = "2099-06-02";
const D_OLD = "2000-01-01";
const SINCE = new Date("2099-01-01T00:00:00Z");
// 蜘蛛 time 是 TIMESTAMP(上限 2038),不能用 2099;取 2037(晚于真实存档 2026、早于 2038 上限)
const SPIDER_DAY = "2037-12-01";
const SPIDER_TIME = "2037-12-01 12:00:00";
const SINCE_SPIDER = new Date("2037-01-01T00:00:00Z");

async function seedVisitor(
  sourceName: string | null,
  device: string | null,
  platform: string | null,
) {
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_statistics_visitor
      (last_counter, referred, agent, ip, user_id, source_name, device, platform)
    VALUES (${D1}, '', 'nt-agent', '127.0.0.1', 0, ${sourceName}, ${device}, ${platform})
  `;
}

async function seedSpider(url: string, type: number, num: number) {
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_baiduseo_zhizhu (name, ip, address, type, num, \`time\`)
    VALUES ('Baiduspider', '127.0.0.1', ${url}, ${type}, ${num}, ${SPIDER_TIME})
  `;
}

async function cleanup() {
  await prisma.$executeRaw`
    DELETE FROM wp_legacy.wp_statistics_summary_totals
    WHERE \`date\` IN (${D1}, ${D2}, ${D_OLD})
  `;
  await prisma.$executeRaw`
    DELETE FROM wp_legacy.wp_statistics_visitor WHERE last_counter = ${D1}
  `;
  await prisma.$executeRaw`
    DELETE FROM wp_legacy.wp_baiduseo_zhizhu WHERE address IN (${URL_A}, ${URL_B}, ${URL_C})
  `;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup(); // 清理上次异常中断残留

  // 趋势:2099 两日 + 2000 一日(用于 days 窗口排除断言)
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_statistics_summary_totals (\`date\`, visitors, views)
    VALUES (${D1}, 111, 222), (${D2}, 333, 444), (${D_OLD}, 5, 5)
  `;

  // 来源/设备/平台:SRC_A×2 / SRC_B×1 / NULL×1(归一为直接访问)
  await seedVisitor(SRC_A, DEV, PLAT);
  await seedVisitor(SRC_A, DEV, PLAT);
  await seedVisitor(SRC_B, DEV, PLAT);
  await seedVisitor(null, null, null);

  // 蜘蛛:404 URL_A 两行(SUM num=8)、URL_B 一行(num=6);200 URL_C(num=10)
  await seedSpider(URL_A, 404, 5);
  await seedSpider(URL_A, 404, 3);
  await seedSpider(URL_B, 404, 6);
  await seedSpider(URL_C, 200, 10);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("getTrafficTrend", () => {
  it("since 窗口内精确聚合:升序 points + UV/PV 合计", async () => {
    const { points, totalUv, totalPv } = await getTrafficTrend({ since: SINCE });
    expect(points).toEqual([
      { date: D1, uv: 111, pv: 222 },
      { date: D2, uv: 333, pv: 444 },
    ]);
    expect(totalUv).toBe(444);
    expect(totalPv).toBe(666);
  });

  it("days 窗口:排除 2000 老数据,points 按日期升序且合计=逐点求和", async () => {
    const { points, totalUv, totalPv } = await getTrafficTrend({ days: 30 });
    expect(points.some((p) => p.date === D_OLD)).toBe(false);
    expect(points.some((p) => p.date === D1)).toBe(true);
    const dates = points.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
    expect(totalUv).toBe(points.reduce((s, p) => s + p.uv, 0));
    expect(totalPv).toBe(points.reduce((s, p) => s + p.pv, 0));
  });
});

describe("getTrafficSource", () => {
  it("来源/设备/平台 Top N:计数降序,NULL 归一(直接访问/未知)", async () => {
    const { sources, devices, platforms } = await getTrafficSource({
      since: SINCE,
      limit: 10,
    });

    expect(sources[0]).toEqual({ name: SRC_A, count: 2 });
    expect(sources).toContainEqual({ name: "直接访问", count: 1 });
    expect(devices[0]).toEqual({ name: DEV, count: 3 });
    expect(devices).toContainEqual({ name: "未知", count: 1 });
    expect(platforms[0]).toEqual({ name: PLAT, count: 3 });
    expect(platforms).toContainEqual({ name: "未知", count: 1 });

    for (const rows of [sources, devices, platforms]) {
      const counts = rows.map((r) => r.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    }
  });

  it("limit 截断各列表长度", async () => {
    const { sources, devices } = await getTrafficSource({ since: SINCE, limit: 1 });
    expect(sources).toHaveLength(1);
    expect(devices).toHaveLength(1);
  });
});

describe("getSpiderSummary", () => {
  it("状态码抓取量(SUM num)+404 URL Top + 最近抓取日", async () => {
    const { statuses, top404, lastCrawl } = await getSpiderSummary({
      since: SINCE_SPIDER,
      top404Limit: 10,
    });

    expect(statuses).toEqual([
      { code: "404", count: 14 },
      { code: "200", count: 10 },
    ]);
    expect(top404).toEqual([
      { url: URL_A, count: 8 },
      { url: URL_B, count: 6 },
    ]);
    expect(lastCrawl).toBe(SPIDER_DAY);
  });

  it("top404Limit 截断,不影响状态汇总", async () => {
    const { statuses, top404 } = await getSpiderSummary({
      since: SINCE_SPIDER,
      top404Limit: 1,
    });
    expect(top404).toHaveLength(1);
    expect(top404[0]?.url).toBe(URL_A);
    expect(statuses).toHaveLength(2);
  });
});
