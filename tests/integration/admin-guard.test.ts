import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { createSession, revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import { getApiAdminSession } from "@/server/session-guard";

/**
 * T044 后台守卫集成(quickstart S5.1,FR-125):
 * admin 放行;moderator/user 403 语义(null)+ admin_access_violation 审计;
 * 未登录(null 会话)拒绝且不误记审计。API 层再校验与页面 requireAdmin 同源。
 */
const RUN = Date.now().toString(36);
const BASE = BigInt(`94${(Number.parseInt(RUN, 36) % 100000).toString().padStart(5, "0")}`);
const uids = [BASE, BASE + 1n, BASE + 2n]; // admin / moderator / user

function reqWithCookie(token: string | undefined, path = "/api/admin/products"): NextRequest {
  const headers = new Headers(token ? { cookie: `${SESSION.ACCESS_COOKIE}=${token}` } : {});
  return new NextRequest(`http://localhost${path}`, { headers });
}

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  for (const uid of uids) {
    await revokeAllSessions(uid.toString());
    await revokeAllRefreshTokens(uid.toString());
  }
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION, actorUserId: { in: uids } },
  });
  await redis.quit();
});

describe("US5 后台守卫(T044,quickstart S5.1)", () => {
  it("admin 会话放行,返回会话载荷", async () => {
    const { accessToken } = await createSession(uids[0]!, "admin");
    const session = await getApiAdminSession(reqWithCookie(accessToken));
    expect(session?.userId).toBe(uids[0]!.toString());
    expect(session?.role).toBe("admin");
  });

  it("moderator/user 403 语义(null)+ admin_access_violation 审计(surface=api)", async () => {
    for (const [i, role] of ["moderator", "user"].entries()) {
      const { accessToken } = await createSession(uids[i + 1]!, role as "moderator" | "user");
      const session = await getApiAdminSession(reqWithCookie(accessToken, "/api/admin/orders"));
      expect(session, role).toBeNull();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION,
          actorUserId: uids[i + 1]!,
        },
        orderBy: { id: "desc" },
      });
      expect(audit.category, role).toBe(AUDIT_CATEGORY.SECURITY);
      const payload = audit.payloadJson as Prisma.JsonObject;
      expect(payload.surface, role).toBe("api");
      expect(payload.role, role).toBe(role);
      expect(payload.path, role).toBe("/api/admin/orders");
    }
  });

  it("未登录(null 会话)拒绝且不记越权审计(401 语义由路由层表达)", async () => {
    const session = await getApiAdminSession(reqWithCookie(undefined));
    expect(session).toBeNull();
    const count = await prisma.auditLog.count({
      where: { action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION, actorUserId: { in: uids } },
    });
    expect(count).toBe(2); // 仅上一用例 moderator/user 两笔
  });
});
