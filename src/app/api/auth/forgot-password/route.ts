import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/http";
import { requestPasswordReset } from "@/server/services/auth/password";

const schema = z.object({ email: z.string().email() });

/**
 * 契约:恒定 202,不泄露邮箱存在性(FR-013 同源);
 * 限速 ≥60s/次、≤5 次/天(服务层按邮箱哈希计数)。
 */
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const ip = req.headers.get("x-forwarded-for");
  await requestPasswordReset(parsed.data.email, { ip });
  return NextResponse.json(
    { message: "若该邮箱已注册,重置邮件将很快送达,请查收(含垃圾箱)。" },
    { status: 202 },
  );
}
