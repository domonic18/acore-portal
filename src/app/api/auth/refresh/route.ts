import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { findRefreshSubject } from "@/server/services/auth/session-refresh";
import {
  consumeRefreshToken,
  createSession,
  parseRefreshToken,
} from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { isProtectedPath, SESSION } from "@/constants/session";
import { safeNextPath } from "@/lib/safe-redirect";
import { checkSameOrigin } from "@/server/origin-guard";
import { apiError } from "@/server/http";

/**
 * remember 登录续期(research R4):access 过期后 middleware 重定向至此;
 * refresh 单次有效,使用即轮换;重放 → 全吊销。
 * GET(导航跳转,307 回原路径)与 POST(前端 fetch)双形态。
 * 角色以业务库为准回查(access JWT 可能已过期不可信)。
 *
 * 用户定位取自 refresh token 自身(userId 段),不读 access cookie——
 * access cookie 2h 到期即被浏览器删除,靠它定位用户会让续期链路必断。
 */
/** 相对路径 307:node runtime 的 NextResponse.redirect(new URL(x, req.url)) 会烙死
 * 容器内部 origin(localhost:3000),经 frpc/反代访问时把用户带偏(与 legacy-redirect 同坑) */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

/** 续期失败落点:受保护路径 ⇒ 去登录页;公开路径 ⇒ 回原路径按未登录渲染 */
function failureRedirect(next: string) {
  const pathname = next.split(/[?#]/)[0] ?? "";
  return isProtectedPath(pathname)
    ? `/login?next=${encodeURIComponent(next)}`
    : next;
}

async function handle(req: NextRequest) {
  // GET 是顶层导航(无 Origin),只对写形态做来源校验
  if (req.method === "POST") {
    const origin = await checkSameOrigin(req);
    if (!origin.ok) return origin.response;
  }
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const presented = req.cookies.get(SESSION.REFRESH_COOKIE)?.value;
  if (!presented) return fail(req, next);

  // 形态不可解析(旧版/损坏 token)不是盗用证据:清 cookie 走正常落点,不吊销会话
  const parts = parseRefreshToken(presented);
  if (!parts) return fail(req, next);

  const user = await findRefreshSubject(BigInt(parts.userId));
  if (!user || user.status === "banned") return fail(req, next);

  const rotated = await consumeRefreshToken(user.id, presented);
  if (!rotated) {
    // 重放/过期:consumeRefreshToken 已全吊销
    return fail(req, next);
  }

  const { accessToken } = await createSession(user.id, user.role);
  const res =
    req.method === "GET"
      ? redirectTo(next)
      : NextResponse.json({ ok: true });
  setSessionCookies(res, { accessToken, refreshToken: rotated.token });
  return res;
}

/**
 * 续期失败:清掉 refresh cookie,避免坏 token 反复触发续期跳转(死循环)。
 * 不清 access cookie——它可能仍有效(用户手工访问本路由时),清了等于无故踢人。
 * GET(导航)⇒ 重定向到落点;POST(客户端 fetch)⇒ 401 JSON,
 * 不能重定向:fetch 会跟到 /login 并重放 POST,拿到的是 405 而非 401。
 */
function fail(req: NextRequest, next: string) {
  const res =
    req.method === "POST"
      ? apiError(401, "SESSION_REFRESH_FAILED", "登录状态已失效,请重新登录。")
      : redirectTo(failureRedirect(next));
  res.cookies.set(SESSION.REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export { handle as GET, handle as POST };
