import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { getCurrentGroupValues } from "@/server/services/settings/current";
import { sensitiveMode } from "@/server/services/settings/schemas";
import { resolveSubmittedValue } from "@/server/services/settings/values";
import { testFeishuAlertChannel } from "@/server/services/settings/connection-test";

const schema = z.object({
  // Webhook 地址与签名密钥只写不读:表单回传空串=沿用现值(同 COS SecretKey 口径)
  webhookUrl: z.string().default(""),
  webhookSecret: z.string().default(""),
});

/**
 * 测试飞书告警通道(用未保存的候选值):真发一张测试卡片,失败是业务结果回显
 * 200 { ok:false, message },不 5xx。审计只记成败,不记地址与密钥。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const current = await getCurrentGroupValues("notify");
  const webhookUrl = resolveSubmittedValue(
    current["notify.feishuWebhookUrl"],
    parsed.data.webhookUrl,
    sensitiveMode("notify", "feishuWebhookUrl"),
  );
  const webhookSecret = resolveSubmittedValue(
    current["notify.feishuWebhookSecret"],
    parsed.data.webhookSecret,
    sensitiveMode("notify", "feishuWebhookSecret"),
  );

  const result = await testFeishuAlertChannel({ webhookUrl, webhookSecret });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SETTINGS_TEST_CONNECTION,
    actorUserId: BigInt(guard.session.userId),
    payload: { channel: "notify.feishu", ok: result.ok },
  });
  return apiOk(result);
}
