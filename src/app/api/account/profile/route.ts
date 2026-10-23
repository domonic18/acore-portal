import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { prisma } from "@/lib/db";

const schema = z.object({
  nickname: z.string().trim().min(2, "昵称至少 2 个字符").max(64, "昵称最多 64 个字符"),
});

/** 契约:PATCH {nickname?}(M1 仅昵称,邮箱走 change-email 独立流程)→ 200 {user} */
export async function PATCH(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const user = await prisma.user.update({
    where: { id: BigInt(session.userId) },
    data: { nickname: parsed.data.nickname },
    select: {
      id: true,
      username: true,
      nickname: true,
      email: true,
    },
  });
  return apiOk({
    user: { id: user.id.toString(), username: user.username, nickname: user.nickname, email: user.email },
  });
}
