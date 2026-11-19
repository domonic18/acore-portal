import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { readMcpAdminView } from "@/server/services/mcp/admin";
import {
  ensureMcpToken,
  revealMcpToken,
  rotateMcpToken,
  updateMcpLimits,
  updateMcpTokenScope,
} from "@/server/services/mcp/auth";
import { MCP_SCOPE } from "@/constants/mcp";

/**
 * 后台 MCP 接入管理(二期 M6;规格 §17.3)
 *
 * GET    令牌视图(掩码)+ 今日调用数 + 最近调用 + 服务地址;无令牌时**自动补发**一枚
 * POST   {action:"reveal"} 取回令牌明文(复制令牌用,留审计)
 *       {action:"rotate"} 轮换令牌(新令牌覆盖旧令牌,旧令牌即时失效)
 * PATCH  调整作用域(只读/可写,即时生效)与限额(QPS / 每日配额 / IP 兜底闸)
 */

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reveal") }),
  z.object({
    action: z.literal("rotate"),
    scope: z.enum([MCP_SCOPE.READ, MCP_SCOPE.WRITE]).optional(),
  }),
]);

const patchSchema = z.object({
  tokenScope: z.enum([MCP_SCOPE.READ, MCP_SCOPE.WRITE]).optional(),
  qpsLimit: z.number().int().min(1).max(60).optional(),
  dailyLimit: z.number().int().min(1).max(100_000).optional(),
  ipMaxPerMin: z.number().int().min(1).max(600).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  await ensureMcpToken(BigInt(guard.session.userId));
  return apiOk(await readMcpAdminView());
}

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, actionSchema);
  if (!parsed.ok) return parsed.response;

  const actorUserId = BigInt(guard.session.userId);
  if (parsed.data.action === "reveal") {
    const plain = await revealMcpToken(actorUserId);
    return apiOk({ plain });
  }
  await rotateMcpToken(actorUserId, parsed.data.scope);
  return apiOk(await readMcpAdminView());
}

export async function PATCH(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const actorUserId = BigInt(guard.session.userId);
  if (parsed.data.tokenScope) {
    await updateMcpTokenScope(parsed.data.tokenScope, actorUserId);
  }
  const token = await updateMcpLimits(
    {
      qpsLimit: parsed.data.qpsLimit,
      dailyLimit: parsed.data.dailyLimit,
      ipMaxPerMin: parsed.data.ipMaxPerMin,
    },
    actorUserId,
  );
  return apiOk({ token });
}
