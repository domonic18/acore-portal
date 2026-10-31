import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadSystemConfig } from "@/lib/config";
import { redis } from "@/lib/redis";
import { getCharactersDb } from "@/lib/db/characters";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  getServerStatus,
  saveStatusConfig,
  todayPeakKey,
} from "@/server/services/status/status";

/**
 * T042 集成测试(US6 服务器状态;quickstart S6):
 * ① 正常态 11 字段契约(mock .server info + characters 统计);
 * ② 降级注入 failure → degraded+上次缓存保留(updatedAt=缓存写入时间);
 * ③ 冷启动失败(无缓存)→ 数字字段 null;④ 峰值 max 语义(失败不污染/更大值保留);
 * ⑤ enabled=false → {enabled:false};⑥ saveStatusConfig PUT 后即时生效+审计前后值
 * +指针失效回退告警(SC-208 注入半)。
 * fixture:characters RUN 段直写(dev 库,creation_date=今日 1 行);mock 态用后还原。
 */
const RUN = Date.now().toString(36);
const GUID_BASE = 9_960_000 + (Number.parseInt(RUN, 36) % 9_000);
const ACTOR_UID = 9_900_042_001n;

let mockBase = "";
const configKeys = ["status.enabled", "status.maintenance_mode", "progression.current_node_id"];
const priorConfig = new Map<string, string | null>();

async function setMockMode(mode: "normal" | "timeout" | "failure") {
  await fetch(`${mockBase}/__mode?mode=${mode}`);
}

beforeAll(async () => {
  mockBase = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await setMockMode("normal");

  for (const key of configKeys) {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    priorConfig.set(key, row?.value ?? null);
  }
  await prisma.systemConfig.upsert({
    where: { key: "status.enabled" },
    create: { key: "status.enabled", value: "true" },
    update: { value: "true" },
  });
  const { reloadSystemConfig } = await import("@/lib/config");
  await reloadSystemConfig();

  const oldDate = new Date("2024-01-01T00:00:00Z");
  const todayDate = new Date();
  // 游戏 DB 账号只读(R5):fixture 走业务连接跨库写(M1/M2 同款)
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health, creation_date)
    VALUES
      (${GUID_BASE}, 1, ${`S42a${RUN.slice(-4)}`}, 1, 1, 0, 60, 0, 1519, 1, 4200, ${oldDate}),
      (${GUID_BASE + 1}, 1, ${`S42b${RUN.slice(-4)}`}, 4, 4, 1, 60, 0, 1519, 1, 3900, ${oldDate}),
      (${GUID_BASE + 2}, 1, ${`S42c${RUN.slice(-4)}`}, 2, 7, 0, 60, 0, 1519, 1, 5100, ${oldDate}),
      (${GUID_BASE + 3}, 1, ${`S42d${RUN.slice(-4)}`}, 6, 1, 0, 60, 0, 1519, 1, 8000, ${oldDate}),
      (${GUID_BASE + 4}, 1, ${`S42e${RUN.slice(-4)}`}, 10, 3, 1, 58, 0, 1519, 0, 2800, ${todayDate})
  `;

  await redis.del("status:probe");
  await redis.del("status:probe:lastok");
  await redis.del(todayPeakKey());
});

afterAll(async () => {
  const db = await getCharactersDb();
  // 游戏 DB 账号只读(R5):清理走业务连接跨库 DELETE(M1 同款)
  await prisma.$executeRaw`DELETE FROM acore_characters.characters WHERE guid BETWEEN ${GUID_BASE} AND ${GUID_BASE + 9}`;
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR_UID } });
  for (const key of configKeys) {
    const prior = priorConfig.get(key);
    if (prior === null || prior === undefined) {
      await prisma.systemConfig.deleteMany({ where: { key } });
    } else {
      await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: prior },
        update: { value: prior },
      });
    }
  }
  const { reloadSystemConfig } = await import("@/lib/config");
  await reloadSystemConfig();
  await redis.del("status:probe");
  await redis.del("status:probe:lastok");
  await redis.del(todayPeakKey());
  await setMockMode("normal");
  await prisma.$disconnect();
  await db.$disconnect();
});

describe("US6 服务器状态(T042)", () => {
  it("正常态:11 字段契约(mock .server info+characters 统计)", async () => {
    const status = await getServerStatus();
    if (!status.enabled) throw new Error("status.enabled 应为 true");
    expect(status.degraded).toBe(false);
    expect(status.online).toBe(true);
    expect(status.uptimeText).toBe("3 days, 4 hours, 12 minutes");
    expect(status.queueCount).toBe(3);

    const db = await getCharactersDb();
    const [baselineOnline, baselineTotal] = await Promise.all([
      db.characters.count({ where: { online: 1 } }),
      db.characters.count(),
    ]);
    // 在线 4(2 联盟+2 部落 fixture)+dev 库可能存在的其他在线行
    expect(status.onlineCount).toBe(baselineOnline);
    expect(baselineOnline).toBeGreaterThanOrEqual(4);
    expect(status.charTotal).toBe(baselineTotal);
    // 阵营比:fixture 联盟 3(人类/暗夜+离线血精灵不计)+部落 2,按 online=1 过滤后联盟 2 部落 2(基线可能含他行,只验≥fixture)
    expect(status.allianceCount).toBeGreaterThanOrEqual(2);
    expect(status.hordeCount).toBeGreaterThanOrEqual(2);
    expect(status.todayNewChars).toBeGreaterThanOrEqual(1);
    expect(typeof status.currentStage).toBe("string");
    expect(status.currentStage!.length).toBeGreaterThan(0);
    expect(status.maintenanceMode).toBe(false);
    expect(new Date(status.updatedAt).toString()).not.toBe("Invalid Date");
  });

  it("峰值 max 语义:更大值保留,探针成功也不回退", async () => {
    const status1 = await getServerStatus();
    if (!status1.enabled) throw new Error("unreachable");
    expect(status1.todayPeak).toBe(status1.onlineCount);

    await redis.set(todayPeakKey(), String((status1.onlineCount ?? 0) + 100));
    await redis.del("status:probe");
    const status2 = await getServerStatus();
    if (!status2.enabled) throw new Error("unreachable");
    expect(status2.todayPeak).toBe((status1.onlineCount ?? 0) + 100);
  });

  it("降级注入 failure:degraded+上次缓存保留(updatedAt=缓存写入时间)", async () => {
    const good = await getServerStatus();
    if (!good.enabled) throw new Error("unreachable");
    expect(good.degraded).toBe(false);

    await setMockMode("failure");
    await redis.del("status:probe"); // 强制穿透一次失败探针
    const bad = await getServerStatus();
    if (!bad.enabled) throw new Error("unreachable");
    expect(bad.degraded).toBe(true);
    // 数字字段保留上次成功值(onlineCount 可能有并发波动, uptime/queue 稳定)
    expect(bad.uptimeText).toBe(good.uptimeText);
    expect(bad.queueCount).toBe(good.queueCount);
    expect(bad.updatedAt).toBe(good.updatedAt);
    // degraded 响应被缓存(防重试风暴):再读仍同值
    const cached = await getServerStatus();
    if (!cached.enabled) throw new Error("unreachable");
    expect(cached.updatedAt).toBe(good.updatedAt);
  });

  it("冷启动失败(无缓存):数字字段 null,online false", async () => {
    await setMockMode("failure");
    await redis.del("status:probe");
    const status = await getServerStatus();
    if (!status.enabled) throw new Error("unreachable");
    expect(status.degraded).toBe(true);
    expect(status.online).toBe(false);
    expect(status.onlineCount).toBeNull();
    expect(status.allianceCount).toBeNull();
    expect(status.hordeCount).toBeNull();
    expect(status.uptimeText).toBeNull();
    expect(status.queueCount).toBeNull();
    expect(status.charTotal).toBeNull();
    expect(status.todayNewChars).toBeNull();
    // 峰值失败不污染:无键即 null
    expect(status.todayPeak).toBeNull();
  });

  it("enabled=false:getServerStatus 直返 {enabled:false}", async () => {
    await setMockMode("normal");
    await prisma.systemConfig.upsert({
      where: { key: "status.enabled" },
      create: { key: "status.enabled", value: "false" },
      update: { value: "false" },
    });
    const { reloadSystemConfig } = await import("@/lib/config");
    await reloadSystemConfig();
    const status = await getServerStatus();
    expect(status).toEqual({ enabled: false });
  });

  it("saveStatusConfig:PUT 即时生效+审计前后值+指针失效告警回退", async () => {
    await setMockMode("normal");
    const { reloadSystemConfig } = await import("@/lib/config");

    // 维护模式开→读新值;审计含 before/after
    await saveStatusConfig({ maintenanceMode: true }, { id: ACTOR_UID });
    const row = await prisma.systemConfig.findUniqueOrThrow({
      where: { key: "status.maintenance_mode" },
    });
    expect(row.value).toBe("true");
    const audit1 = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.STATUS_CONFIG_CHANGE },
      orderBy: { id: "desc" },
    });
    expect(audit1.category).toBe(AUDIT_CATEGORY.ADMIN);
    const payload1 = audit1.payloadJson as {
      before: Record<string, string | null>;
      after: Record<string, string | null>;
    };
    expect(payload1.after["status.maintenance_mode"]).toBe("true");

    // 指针指向不存在节点:仍落库(运行期回退),审计告警 pointerInvalid
    const result = await saveStatusConfig(
      { currentNodeId: 987_654_321n },
      { id: ACTOR_UID },
    );
    expect(result.pointerInvalid).toBe(true);
    const audit2 = await prisma.auditLog.findFirst({
      where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.STATUS_CONFIG_CHANGE },
      orderBy: { id: "desc" },
    });
    expect(
      (audit2?.payloadJson as { pointerInvalid?: boolean }).pointerInvalid,
    ).toBe(true);

    // 合法指针:落库且无告警;配置读面即时生效(reload 后维护模式仍 true)
    const node = await prisma.progressionNode.findFirstOrThrow({
      orderBy: { id: "asc" },
      select: { id: true },
    });
    const ok = await saveStatusConfig({ currentNodeId: node.id }, { id: ACTOR_UID });
    expect(ok.pointerInvalid).toBe(false);
    const pointer = await prisma.systemConfig.findUniqueOrThrow({
      where: { key: "progression.current_node_id" },
    });
    expect(pointer.value).toBe(node.id.toString());
    expect((await reloadSystemConfig()).status.maintenanceMode).toBe(true);
  });
});
