import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/http";
import { resendActivation } from "@/server/services/auth/register";

/** 契约:恒定 202,不泄露邮箱存在性/是否可重发(FR-013 同源);限速由服务层按用户计数 */
const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  await resendActivation(parsed.data.email);
  return NextResponse.json(
    { message: "若该邮箱可重发,激活邮件将很快送达,请查收(含垃圾箱)。" },
    { status: 202 },
  );
}
