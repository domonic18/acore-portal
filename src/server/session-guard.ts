import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromToken, type SessionPayload } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";

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
