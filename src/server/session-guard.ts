import "server-only";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromToken, type SessionPayload } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * RSC 深校验守卫(middleware 浅校验之外的吊销态兜底,FR-014):
 * jti 已吊销的 access JWT 能过 edge 浅校验,但在受保护页必须立即失效。
 */
export async function requireSession(): Promise<SessionPayload> {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;
  if (!session) redirect("/login");
  return session;
}

/** Route Handler 深校验(不重定向;401 语义由调用方表达) */
export async function getApiSession(req: NextRequest): Promise<SessionPayload | null> {
  return getSessionFromToken(req.cookies.get(SESSION.ACCESS_COOKIE)?.value);
}

/** 后台 RSC 守卫(FR-125):仅 admin 可达;moderator/user/未登录拒绝,越权记审计 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "admin") {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION,
      actorUserId: BigInt(session.userId),
      payload: { role: session.role, surface: "page" },
    });
    redirect("/");
  }
  return session;
}

/** 后台 API 守卫(admin 或 null;非 admin 由调用方回 403,审计在此统一落) */
export async function getApiAdminSession(req: NextRequest): Promise<SessionPayload | null> {
  const session = await getSessionFromToken(req.cookies.get(SESSION.ACCESS_COOKIE)?.value);
  if (!session || session.role !== "admin") {
    if (session) {
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION,
        actorUserId: BigInt(session.userId),
        payload: { role: session.role, surface: "api", path: new URL(req.url).pathname },
        ip: req.headers.get("x-forwarded-for"),
      });
    }
    return null;
  }
  return session;
}

export type ApiAdminGuard =
  | { ok: true; session: SessionPayload }
  | { ok: false; status: 401 | 403; code: string; message: string };

/** API 路由统一入口(quickstart S5.1:未登录 401,登录非 admin 403+审计) */
export async function requireApiAdmin(req: NextRequest): Promise<ApiAdminGuard> {
  const session = await getApiSession(req);
  if (!session) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "请先登录。" };
  }
  const admin = await getApiAdminSession(req);
  if (!admin) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "需要管理员权限。" };
  }
  return { ok: true, session: admin };
}
