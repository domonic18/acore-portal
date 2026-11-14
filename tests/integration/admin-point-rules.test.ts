import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION } from "@/constants/audit";
import { POINT_RULE_AMOUNT_MAX, POINT_RULE_EVENT } from "@/constants/points";
import { createSession } from "@/lib/auth/session";
import { listPointRules, savePointRules } from "@/server/services/points/admin";
import { GET as rulesGet, PUT as rulesPut } from "@/app/api/admin/point-rules/route";

/**
 * 后台积分规则管控集成(服务层 + 路由层契约):
 * 列表含受管事件(缺行也列出)、保存 upsert 补种 + 只对变化落审计、分值/事件值域校验;
 * 路由层 admin 放行 / 普通用户 403(越权审计)/ 未登录 401 / 非法载荷 422。
 *
 * 规则行是全局配置:本文件改完必须在 afterAll 原样还原,别把测试值漏进后续用例。
 */
const RUN = Date.now().toString(36);
const ACTOR = `ruleadmin${RUN}`;
const REG = POINT_RULE_EVENT.REGISTER;

let actorId = 0n;
let snapshot: { event: string; amount: number; enabled: boolean; remark: string | null }[] = [];

async function errorBody(res: Response): Promise<{ code: string; message: string }> {
  const json = (await res.json()) as { error?: { code?: string; message?: string } };
  return { code: json.error?.code ?? "", message: json.error?.message ?? "" };
}

/** 带会话的积分规则请求 */
async function rulesReq(
  method: "GET" | "PUT",
  body?: unknown,
  who: { id: bigint; role: "admin" | "user" } = { id: actorId, role: "admin" },
): Promise<NextRequest> {
  const { accessToken } = await createSession(who.id, who.role);
  return new NextRequest("http://localhost/api/admin/point-rules", {
    method,
    headers: new Headers({
      "content-type": "application/json",
      cookie: `${SESSION.ACCESS_COOKIE}=${accessToken}`,
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  snapshot = await prisma.pointRule.findMany({
    select: { event: true, amount: true, enabled: true, remark: true },
  });
  await prisma.user.create({
    data: {
      username: ACTOR,
      role: "admin",
      email: `rule-${RUN}@t.local`,
      passwordHash: "x",
      passwordAlgo: "phpass",
    },
  });
  actorId = (await prisma.user.findUniqueOrThrow({ where: { username: ACTOR } })).id;
});

afterAll(async () => {
  // 规则行原样还原(删掉本文件新建的行,恢复原有分值/开关/说明)
  await prisma.pointRule.deleteMany({
    where: { event: { notIn: snapshot.map((r) => r.event) } },
  });
  for (const row of snapshot) {
    await prisma.pointRule.upsert({
      where: { event: row.event },
      create: row,
      update: { amount: row.amount, enabled: row.enabled, remark: row.remark },
    });
  }
  await prisma.auditLog.deleteMany({ where: { actorUserId: actorId } });
  await prisma.user.deleteMany({ where: { username: ACTOR } });
  await prisma.$disconnect();
});

describe("积分规则列表", () => {
  it("列出全部受管事件与库内取值(缺行事件也列出,便于后台补种)", async () => {
    const rules = await listPointRules();
    expect(rules.map((r) => r.event)).toEqual([POINT_RULE_EVENT.REGISTER, POINT_RULE_EVENT.BADGE_GRANT]);
    const register = rules.find((r) => r.event === REG)!;
    const row = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    expect(register.amount).toBe(row.amount);
    expect(register.enabled).toBe(row.enabled);
    expect(register.configured).toBe(true);
    expect(register.label.length).toBeGreaterThan(0);
  });

  it("缺行事件标记为未配置,保存即补种(upsert)", async () => {
    await prisma.pointRule.deleteMany({ where: { event: POINT_RULE_EVENT.BADGE_GRANT } });
    const listed = await listPointRules();
    expect(listed.find((r) => r.event === POINT_RULE_EVENT.BADGE_GRANT)?.configured).toBe(false);

    const outcome = await savePointRules({
      changes: [{ event: POINT_RULE_EVENT.BADGE_GRANT, amount: 7, enabled: true }],
      operatorId: actorId,
    });
    expect(outcome).toEqual({ ok: true, changed: [POINT_RULE_EVENT.BADGE_GRANT] });
    const row = await prisma.pointRule.findUniqueOrThrow({
      where: { event: POINT_RULE_EVENT.BADGE_GRANT },
    });
    expect(row.amount).toBe(7);
    expect(row.enabled).toBe(true);
  });
});

describe("积分规则保存", () => {
  it("改分值与开关落库 + 审计(记前后值)", async () => {
    const before = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    const outcome = await savePointRules({
      changes: [{ event: REG, amount: 5, enabled: false }],
      operatorId: actorId,
    });
    expect(outcome).toEqual({ ok: true, changed: [REG] });

    const row = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    expect(row.amount).toBe(5);
    expect(row.enabled).toBe(false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: actorId, action: AUDIT_ACTION.POINT_RULE_SAVED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({
      event: REG,
      before: { amount: before.amount, enabled: before.enabled },
      after: { amount: 5, enabled: false },
    });
  });

  it("值未变则不落审计(不刷审计日志)", async () => {
    const current = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    const before = await prisma.auditLog.count({
      where: { actorUserId: actorId, action: AUDIT_ACTION.POINT_RULE_SAVED },
    });
    const outcome = await savePointRules({
      changes: [{ event: REG, amount: current.amount, enabled: current.enabled }],
      operatorId: actorId,
    });
    expect(outcome).toEqual({ ok: true, changed: [] });
    const after = await prisma.auditLog.count({
      where: { actorUserId: actorId, action: AUDIT_ACTION.POINT_RULE_SAVED },
    });
    expect(after).toBe(before);
  });

  it("分值越界与未知事件一律拒绝(零写入)", async () => {
    const before = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    const negative = await savePointRules({
      changes: [{ event: REG, amount: -1, enabled: true }],
      operatorId: actorId,
    });
    expect(negative).toEqual({ ok: false, reason: "invalid_amount" });
    const tooBig = await savePointRules({
      changes: [{ event: REG, amount: POINT_RULE_AMOUNT_MAX + 1, enabled: true }],
      operatorId: actorId,
    });
    expect(tooBig).toEqual({ ok: false, reason: "invalid_amount" });
    const unknown = await savePointRules({
      changes: [{ event: "not_a_rule" as never, amount: 1, enabled: true }],
      operatorId: actorId,
    });
    expect(unknown).toEqual({ ok: false, reason: "invalid_event" });

    const after = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    expect(after.amount).toBe(before.amount);
    expect(after.enabled).toBe(before.enabled);
  });
});

describe("GET/PUT /api/admin/point-rules", () => {
  it("admin 可读可写:列表含规则,保存后落库", async () => {
    const listRes = await rulesGet(await rulesReq("GET"));
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { rules: { event: string; amount: number }[] };
    expect(listBody.rules.map((r) => r.event)).toContain(REG);

    const putRes = await rulesPut(
      await rulesReq("PUT", { rules: [{ event: REG, amount: 9, enabled: true }] }),
    );
    expect(putRes.status).toBe(200);
    const row = await prisma.pointRule.findUniqueOrThrow({ where: { event: REG } });
    expect(row.amount).toBe(9);
    expect(row.enabled).toBe(true);
  });

  it("普通用户 403 + 越权审计;未登录 401", async () => {
    const res = await rulesGet(await rulesReq("GET", undefined, { id: actorId, role: "user" }));
    expect(res.status).toBe(403);
    expect((await errorBody(res)).code).toBe("FORBIDDEN");

    const anonymous = new NextRequest("http://localhost/api/admin/point-rules", {
      method: "GET",
    });
    const res2 = await rulesGet(anonymous);
    expect(res2.status).toBe(401);
    expect((await errorBody(res2)).code).toBe("UNAUTHORIZED");
  });

  it("非法载荷 422 VALIDATION_ERROR(事件越界/分值越界/空列表)", async () => {
    const badEvent = await rulesPut(
      await rulesReq("PUT", { rules: [{ event: "shop_payment", amount: 1, enabled: true }] }),
    );
    expect(badEvent.status).toBe(422);
    expect((await errorBody(badEvent)).code).toBe("VALIDATION_ERROR");

    const badAmount = await rulesPut(
      await rulesReq("PUT", { rules: [{ event: REG, amount: -5, enabled: true }] }),
    );
    expect(badAmount.status).toBe(422);

    const empty = await rulesPut(await rulesReq("PUT", { rules: [] }));
    expect(empty.status).toBe(422);
  });
});
