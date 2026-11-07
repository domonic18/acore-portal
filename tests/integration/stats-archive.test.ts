import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getArchiveAcquisition,
  getArchiveAudience,
  getArchiveHourly,
  getArchiveLastDate,
  getArchiveTopPages,
} from "@/server/services/stats/archive";
import {
  getSpiderSummary,
  getTrafficTrend,
} from "@/server/services/stats/traffic";

/**
 * WP Statistics 存档只读聚合 + 百度蜘蛛日志(数据看板重构后的存档维度):
 * 聚合 wp_legacy 存档库(wp_statistics_summary_totals / visitor / pages + 百度 SEO 蜘蛛表)。
 *
 * 集成测试向 wp_legacy 写入 RUN 标记 fixture(业务连接用户有 *.* 写权限,见 dev 库 grants),
 * 经 since 时间窗(未来 2099 日期)隔离真实存档数据 → 断言精确聚合 → 按标记清理。
 * 未来日期避开真实存档(2022-2026)且不撞 date 唯一键。
 */
const RUN = Date.now().toString(36).slice(-6);
const SRC_A = `ntsrc-a-${RUN}`;
const SRC_B = `ntsrc-b-${RUN}`;
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

/** 存档访客 fixture(带画像/引荐/时段维度) */
type VisitorFixture = {
  source: string | null;
  referred: string;
  agent: string;
  platform: string | null;
  device: string | null;
  location: string | null;
  lastView: string;
  ip: string;
};

async function seedVisitor(f: VisitorFixture) {
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_statistics_visitor
      (last_counter, referred, agent, ip, user_id, source_name, device, platform, location, hits, last_view)
    VALUES (${D1}, ${f.referred}, ${f.agent}, ${f.ip}, 0, ${f.source}, ${f.device}, ${f.platform}, ${f.location}, 1, ${f.lastView})
  `;
}

async function seedSpider(url: string, type: number, num: number) {
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_baiduseo_zhizhu (name, ip, address, type, num, \`time\`)
    VALUES ('Baiduspider', '127.0.0.1', ${url}, ${type}, ${num}, ${SPIDER_TIME})
  `;
}

async function seedPage(uri: string, type: string, date: string, count: number) {
  await prisma.$executeRaw`
    INSERT INTO wp_legacy.wp_statistics_pages (uri, type, \`date\`, \`count\`, id)
    VALUES (${uri}, ${type}, ${date}, ${count}, 0)
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
    DELETE FROM wp_legacy.wp_statistics_pages WHERE uri LIKE ${`/nt-page-%-${RUN}`}
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

  // 访客画像/获客 fixture:
  // 1-3 百度引荐(其中 1/2 同一条搜索词 URL) 4 Google 5-6 直接访问(6 带自家引荐)
  // 7 未知来源 + 外部引荐 8 百度垃圾词(字母+数字混排,应被过滤)
  await seedVisitor({
    source: SRC_A,
    referred: "https://www.baidu.com/s?wd=怀旧服开服",
    agent: "Chrome",
    platform: "Windows",
    device: "desktop",
    location: "CN",
    lastView: "2099-06-01 09:15:00",
    ip: "127.0.0.1",
  });
  await seedVisitor({
    source: SRC_A,
    referred: "https://www.baidu.com/s?wd=怀旧服开服",
    agent: "Firefox",
    platform: "Windows",
    device: "desktop",
    location: "CN",
    lastView: "2099-06-01 09:45:00",
    ip: "127.0.0.2",
  });
  await seedVisitor({
    source: SRC_A,
    referred: "https://www.baidu.com/s?wd=魔兽世界怀旧",
    agent: "Chrome",
    platform: "Windows",
    device: "desktop",
    location: "CN",
    lastView: "2099-06-01 21:15:00",
    ip: "127.0.0.3",
  });
  await seedVisitor({
    source: SRC_B,
    referred: "https://www.google.com/search?q=azerothcore",
    agent: "Safari",
    platform: "OS X",
    device: "tablet",
    location: "US",
    lastView: "2099-06-01 12:00:00",
    ip: "127.0.0.4",
  });
  await seedVisitor({
    source: "Direct",
    referred: "",
    agent: "Chrome",
    platform: "Android",
    device: "mobile:smart",
    location: "000",
    lastView: "2099-06-01 20:00:00",
    ip: "127.0.0.5",
  });
  await seedVisitor({
    source: "Direct",
    referred: "https://lokta.cn/forum/",
    agent: "Chrome",
    platform: "Android",
    device: "mobile:smart",
    location: "",
    lastView: "2099-06-01 20:30:00",
    ip: "127.0.0.6",
  });
  await seedVisitor({
    source: null,
    referred: "https://news.example.com/article",
    agent: "Chrome",
    platform: "Android",
    device: "mobile:smart",
    location: "",
    lastView: "2099-06-01 20:45:00",
    ip: "127.0.0.7",
  });
  await seedVisitor({
    source: SRC_A,
    referred: "https://www.baidu.com/s?wd=battleq4v",
    agent: "QQ Browser",
    platform: "Windows",
    device: "desktop",
    location: "CN",
    lastView: "2099-06-01 09:50:00",
    ip: "127.0.0.8",
  });

  // Top 页面:同 URI 跨日累加 + 一条旧数据(应被 since 窗口排除)
  await seedPage(`/nt-page-a-${RUN}`, "post", D1, 5);
  await seedPage(`/nt-page-a-${RUN}`, "post", D2, 3);
  await seedPage(`/nt-page-b-${RUN}`, "page", D1, 7);
  await seedPage(`/nt-page-c-${RUN}`, "post", D_OLD, 99);

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

describe("getArchiveAudience", () => {
  it("设备/系统/浏览器/地区:原始值归一为展示名,计数降序", async () => {
    const { devices, platforms, browsers, countries } = await getArchiveAudience({
      since: SINCE,
      limit: 10,
    });

    expect(devices).toEqual([
      { name: "桌面端", count: 4 },
      { name: "手机", count: 3 },
      { name: "平板", count: 1 },
    ]);
    expect(platforms).toEqual([
      { name: "Windows", count: 4 },
      { name: "Android", count: 3 },
      { name: "macOS", count: 1 },
    ]);
    // 浏览器计数存在并列,只断言首位与其余成员(顺序不保证)
    expect(browsers[0]).toEqual({ name: "Chrome", count: 5 });
    expect(browsers).toHaveLength(4);
    expect(browsers).toContainEqual({ name: "Firefox", count: 1 });
    expect(browsers).toContainEqual({ name: "Safari", count: 1 });
    expect(browsers).toContainEqual({ name: "QQ 浏览器", count: 1 });
    // location '000' 归「未知」,空串行不入统计
    expect(countries[0]).toEqual({ name: "中国", count: 4 });
    expect(countries).toHaveLength(3);
    expect(countries).toContainEqual({ name: "美国", count: 1 });
    expect(countries).toContainEqual({ name: "未知", count: 1 });
  });

  it("limit 截断各维度长度", async () => {
    const { devices } = await getArchiveAudience({ since: SINCE, limit: 1 });
    expect(devices).toHaveLength(1);
  });
});

describe("getArchiveAcquisition", () => {
  it("搜索引擎单列 + 直接访问计数 + 外部引荐排除自家与搜索引擎", async () => {
    const { engines, directCount, referrers } = await getArchiveAcquisition({
      since: SINCE,
      limit: 10,
    });

    expect(engines).toEqual([
      { name: SRC_A, count: 4 },
      { name: SRC_B, count: 1 },
    ]);
    expect(directCount).toBe(2);
    expect(referrers).toEqual([{ name: "news.example.com", count: 1 }]);
  });

  it("搜索词:按词聚合访客数,过滤字母+数字混排的垃圾串", async () => {
    const { terms } = await getArchiveAcquisition({ since: SINCE, limit: 10 });

    expect(terms).toContainEqual({ term: "怀旧服开服", count: 2 });
    expect(terms).toContainEqual({ term: "魔兽世界怀旧", count: 1 });
    expect(terms).toContainEqual({ term: "azerothcore", count: 1 });
    expect(terms.some((t) => t.term === "battleq4v")).toBe(false);
  });

  it("limit 截断引擎列表长度", async () => {
    const { engines } = await getArchiveAcquisition({ since: SINCE, limit: 1 });
    expect(engines).toHaveLength(1);
  });
});

describe("getArchiveTopPages", () => {
  it("同 URI 跨日累加,按浏览量降序,since 窗口排除旧数据", async () => {
    const pages = await getArchiveTopPages({ since: SINCE, limit: 10 });

    expect(pages).toContainEqual({
      uri: `/nt-page-a-${RUN}`,
      type: "post",
      hits: 8,
    });
    expect(pages).toContainEqual({
      uri: `/nt-page-b-${RUN}`,
      type: "page",
      hits: 7,
    });
    expect(pages.find((p) => p.uri === `/nt-page-c-${RUN}`)).toBeUndefined();
    expect(pages[0]?.hits).toBeGreaterThanOrEqual(pages[1]?.hits ?? 0);
  });
});

describe("getArchiveHourly", () => {
  it("按最后一次访问的小时聚合,升序", async () => {
    const hourly = await getArchiveHourly({ since: SINCE });

    expect(hourly).toEqual([
      { hour: 9, count: 3 },
      { hour: 12, count: 1 },
      { hour: 20, count: 3 },
      { hour: 21, count: 1 },
    ]);
  });
});

describe("getArchiveLastDate", () => {
  it("返回存档汇总表的最大日期", async () => {
    expect(await getArchiveLastDate()).toBe(D2);
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
