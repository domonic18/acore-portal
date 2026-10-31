import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { sendTestMail } from "@/server/services/settings/save";

const schema = z.object({ to: z.string().email() });

// 测试发信(api-admin-m4 契约):直发不入 outbox;发送失败是业务结果回显
// 200 { ok:false, error:"摘要" },不 5xx
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const result = await sendTestMail(parsed.data.to, {
    id: BigInt(guard.session.userId),
  });
  return apiOk(result);
}
