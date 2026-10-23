import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * API 响应与错误约定(contracts 通用节):
 * 错误统一 { error: { code, message } },message 面向用户、不暴露内部细节
 */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function apiOk<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** 请求边界 Zod 校验封装(宪法 VI) */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(422, "VALIDATION_ERROR", "请求格式错误"),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      response: apiError(
        422,
        "VALIDATION_ERROR",
        first ? `参数错误:${first.path.join(".") || "body"}` : "参数错误",
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** 唯一索引冲突翻译(research R9) */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
