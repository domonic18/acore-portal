import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { getCurrentGroupValues } from "@/server/services/settings/current";
import { sensitiveMode } from "@/server/services/settings/schemas";
import { resolveSubmittedValue } from "@/server/services/settings/values";
import { testSoapConnection } from "@/server/services/settings/connection-test";

const schema = z.object({
  url: z.string().min(1),
  user: z.string().min(1),
  // 口令只写不读:表单回传空串=沿用现值
  password: z.string().default(""),
});

/**
 * 测试 SOAP 通道(用未保存的候选值):失败是业务结果回显 200 { ok:false, message },
 * 不 5xx。审计只记成败,不记连接参数。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const current = await getCurrentGroupValues("soap");
  const password = resolveSubmittedValue(
    current["soap.password"],
    parsed.data.password,
    sensitiveMode("soap", "password"),
  );
  const result = await testSoapConnection({
    url: parsed.data.url,
    user: parsed.data.user,
    password,
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SETTINGS_TEST_CONNECTION,
    actorUserId: BigInt(guard.session.userId),
    payload: { channel: "soap", ok: result.ok },
  });
  return apiOk(result);
}
