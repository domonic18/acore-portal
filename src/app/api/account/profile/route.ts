import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { updateAccountNickname } from "@/server/services/account/profile";
import { checkSameOrigin } from "@/server/origin-guard";

const schema = z.object({
  nickname: z.string().trim().min(2, "昵称至少 2 个字符").max(64, "昵称最多 64 个字符"),
});

/** 契约:PATCH {nickname?}(M1 仅昵称,邮箱走 change-email 独立流程)→ 200 {user} */
export async function PATCH(req: NextRequest) {
  const origin = await checkSameOrigin(req);
  if (!origin.ok) return origin.response;
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const user = await updateAccountNickname(
    BigInt(session.userId),
    parsed.data.nickname,
  );
  return apiOk({
    user: { id: user.id.toString(), username: user.username, nickname: user.nickname, email: user.email },
  });
}
