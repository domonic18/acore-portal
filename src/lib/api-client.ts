/**
 * 客户端请求骨架:统一「非 2xx → 抛 ApiRequestError」与响应体解析。
 * 代理层错误页(413/502)是 HTML,res.json() 会直接抛 SyntaxError,故按文本解析兜底。
 */

type ApiErrorPayload = { error?: { code?: string; message?: string } };

/** 会话过期的错误码:与凭据类 401(INVALID_CREDENTIALS)区分,只有前者可续期重试 */
const SESSION_EXPIRED_CODE = "UNAUTHORIZED";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export async function requestJson<T = Record<string, unknown>>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  const parsed = await parseResponse(res);
  if (res.ok) return (parsed.body ?? {}) as T;

  // 会话过期 ⇒ 先续期再重放一次(remember 登录链路)。
  // 中间件只在页面导航时续期,页面停留超 2h 后的接口调用靠这里补。
  if (
    res.status === 401 &&
    parsed.code === SESSION_EXPIRED_CODE &&
    (await refreshSession())
  ) {
    const retry = await fetch(input, init);
    const retried = await parseResponse(retry);
    if (retry.ok) return (retried.body ?? {}) as T;
    throw toError(retry.status, retried.code, retried.message);
  }
  throw toError(res.status, parsed.code, parsed.message);
}

/**
 * 续期一次:POST /api/auth/refresh(同源、HttpOnly cookie 随请求带上)。
 * 失败(无 refresh cookie / token 失效)⇒ 返回 false,调用方照旧抛原 401。
 */
async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

type ParsedResponse = { body: unknown; code?: string; message?: string };

async function parseResponse(res: Response): Promise<ParsedResponse> {
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const error = (body as ApiErrorPayload | null)?.error;
  return { body, code: error?.code, message: error?.message };
}

function toError(status: number, code?: string, message?: string): ApiRequestError {
  const fallback =
    status === 413
      ? "请求内容过大,被服务器拒绝(HTTP 413)。"
      : `请求失败(HTTP ${status}),请稍后重试。`;
  return new ApiRequestError(message ?? fallback, status, code);
}

/** 取可展示错误文案:仅信任本客户端抛出的服务端消息,网络异常统一兜底 */
export function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : "网络异常,请稍后重试。";
}
