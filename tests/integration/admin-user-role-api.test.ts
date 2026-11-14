import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { createSession, getSessionFromToken } from "@/lib/auth/session";
import { POST as rolePost } from "@/app/api/admin/users/[id]/role/route";

/**
 * 后台角色分配接口集成(路由层契约):
 * admin 提权 → 200 + 落库 + 审计 + 目标会话吊销;普通用户 403(越权审计)/未登录 401;
 * 自改 422 SELF_ROLE_CHANGE;非法 role 值 422 VALIDATION_ERROR;目标不存在 404。
 * 前端「提权 admin 需二次确认」是客户端闸门,判定规则见 tests/unit/role-elevation.test.ts。
 */
const RUN = Date.now().toString(36);
const SUFFIX = `api${RUN}`;
const ACTOR = `roleapiadmin${SUFFIX}`;
const TARGET = `roleapitarget${SUFFIX}`;

let actorId = 0n;
let targetId = 0n;

/** 带会话的角色分配请求(actor 身份 + 目标用户 + 载荷) */
async function roleReq(
  target: bigint,
  body: unknown,
  who: { id: bigint; role: "admin" | "user" | "moderator" } = { id: actorId, role: "admin" },
): Promise<NextRequest> {
  const { accessToken } = await createSession(who.id, who.role);
  return new NextRequest(`http://localhost/api/admin/users/${target}/role`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      cookie: `${SESSION.ACCESS_COOKIE}=${accessToken}`,
    }),
    body: JSON.stringify(body),
  });
}

async function errorBody(res: Response): Promise<{ code: string; message: string }> {
  const json = (await res.json()) as { error?: { code?: string; message?: string } };
  return { code: json.error?.code ?? "", message: json.error?.message ?? "" };
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  await prisma.user.createMany({
    data: [
      {
        username: ACTOR,
        role: "admin",
        email: `actor-${RUN}@t.local`,
        passwordHash: "x",
        passwordAlgo: "phpass",
      },
      {
        username: TARGET,
        role: "user",
        email: `target-${RUN}@t.local`,
        passwordHash: "x",
        passwordAlgo: "phpass",
      },
    ],
  });
  actorId = (await prisma.user.findUniqueOrThrow({ where: { username: ACTOR } })).id;
  targetId = (await prisma.user.findUniqueOrThrow({ where: { username: TARGET } })).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [actorId, targetId] } } });
  await prisma.user.deleteMany({ where: { username: { in: [ACTOR, TARGET] } } });
  await prisma.$disconnect();
});

describe("POST /api/admin/users/[id]/role", () => {
  it("admin 提权到 admin:200 + 落库 + 审计 + 目标会话吊销", async () => {
    const { accessToken } = await createSession(targetId, "user"); // 目标现存会话
    expect(await getSessionFromToken(accessToken)).not.toBeNull();

    const res = await rolePost(await roleReq(targetId, { role: "admin" }), {
      params: { id: targetId.toString() },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ oldRole: "user", newRole: "admin" });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { role: true } });
    expect(row.role).toBe("admin");
    expect(await getSessionFromToken(accessToken)).toBeNull(); // 提权即吊销目标全部会话

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: actorId, action: AUDIT_ACTION.USER_ROLE_CHANGE },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({
      targetUserId: targetId.toString(),
      oldRole: "user",
      newRole: "admin",
    });
  });

  it("普通用户会话 403 + 越权审计;未登录 401", async () => {
    const res = await rolePost(
      await roleReq(targetId, { role: "user" }, { id: targetId, role: "user" }),
      { params: { id: targetId.toString() } },
    );
    expect(res.status).toBe(403);
    expect((await errorBody(res)).code).toBe("FORBIDDEN");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { role: true } });
    expect(row.role).toBe("admin"); // 越权不改角色

    const violation = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: targetId, action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION },
      orderBy: { id: "desc" },
    });
    expect(violation.category).toBe(AUDIT_CATEGORY.SECURITY);

    const anonymous = new NextRequest(
      `http://localhost/api/admin/users/${targetId}/role`,
      {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        body: JSON.stringify({ role: "user" }),
      },
    );
    const res2 = await rolePost(anonymous, { params: { id: targetId.toString() } });
    expect(res2.status).toBe(401);
    expect((await errorBody(res2)).code).toBe("UNAUTHORIZED");
  });

  it("自改 422 SELF_ROLE_CHANGE,角色不变", async () => {
    const res = await rolePost(await roleReq(actorId, { role: "user" }), {
      params: { id: actorId.toString() },
    });
    expect(res.status).toBe(422);
    expect((await errorBody(res)).code).toBe("SELF_ROLE_CHANGE");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } });
    expect(row.role).toBe("admin");
  });

  it("非法 role 值 422 VALIDATION_ERROR;目标不存在 404", async () => {
    const bad = await rolePost(await roleReq(targetId, { role: "superuser" }), {
      params: { id: targetId.toString() },
    });
    expect(bad.status).toBe(422);
    expect((await errorBody(bad)).code).toBe("VALIDATION_ERROR");

    const missing = await rolePost(await roleReq(9_999_999n, { role: "user" }), {
      params: { id: "9999999" },
    });
    expect(missing.status).toBe(404);
    expect((await errorBody(missing)).code).toBe("NOT_FOUND");
  });
});
