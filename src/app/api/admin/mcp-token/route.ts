import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { readMcpAdminView } from "@/server/services/mcp/admin";
import {
  issueMcpToken,
  readMcpTokenView,
  revokeMcpToken,
  updateMcpLimits,
} from "@/server/services/mcp/auth";
import { MCP_SCOPE } from "@/constants/mcp";

/**
 * 后台 MCP 令牌管理(二期 M6;规格 §17.3)
 *
 * GET    令牌状态 + 今日调用数 + 最近调用(只读视图,永不含哈希/明文)
 * POST   签发新令牌(= 轮换,旧令牌即时作废)→ 明文**只在本次响应里出现一次**
 * PATCH  调整限额(QPS / 每日配额 / IP 兜底闸)
 * DELETE 吊销(清空哈希)
 */

const issueSchema = z.object({
  scope: z.enum([MCP_SCOPE.READ, MCP_SCOPE.WRITE]),
  ttlDays: z.number().int().positive().max(365).optional(),
});

const limitsSchema = z.object({
  qpsLimit: z.number().int().min(1).max(60).optional(),
  dailyLimit: z.number().int().min(1).max(100_000).optional(),
  ipMaxPerMin: z.number().int().min(1).max(600).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk(await readMcpAdminView());
}

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, issueSchema);
  if (!parsed.ok) return parsed.response;

  const issued = await issueMcpToken({
    scope: parsed.data.scope,
    ttlDays: parsed.data.ttlDays,
    adminUserId: BigInt(guard.session.userId),
  });
  return apiOk({
    token: await readMcpTokenView(),
    // 明文只在这里出现一次:后台须当场展示并让运营自行保存
    plain: issued.plain,
    expiresAt: issued.expiresAt,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, limitsSchema);
  if (!parsed.ok) return parsed.response;

  const token = await updateMcpLimits(parsed.data, BigInt(guard.session.userId));
  return apiOk({ token });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  await revokeMcpToken(BigInt(guard.session.userId));
  return apiOk({ token: await readMcpTokenView() });
}
