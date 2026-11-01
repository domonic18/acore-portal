/**
 * 客户端请求骨架:统一「非 2xx → 抛 ApiRequestError」与响应体解析。
 * 代理层错误页(413/502)是 HTML,res.json() 会直接抛 SyntaxError,故按文本解析兜底。
 */

type ApiErrorPayload = { error?: { code?: string; message?: string } };

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
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const error = (body as ApiErrorPayload | null)?.error;
    const fallback =
      res.status === 413
        ? "请求内容过大,被服务器拒绝(HTTP 413)。"
        : `请求失败(HTTP ${res.status}),请稍后重试。`;
    throw new ApiRequestError(error?.message ?? fallback, res.status, error?.code);
  }
  return (body ?? {}) as T;
}

/** 取可展示错误文案:仅信任本客户端抛出的服务端消息,网络异常统一兜底 */
export function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : "网络异常,请稍后重试。";
}
