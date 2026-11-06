import "server-only";
import { getConfig } from "@/lib/config";

/** Cloudflare Turnstile siteverify 封装(research R1;零 npm 依赖) */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = {
  ok: boolean;
  errors?: string[];
  /** 人机校验是否真正生效(已启用且双密钥齐备) */
  configured: boolean;
};

/**
 * 服务端人机校验:
 * - 未配置/enabled=false → 快速直通(默认关态,FR-304)
 * - enabled=true 但密钥缺失(misconfigured) → 失败关闭(not-configured):
 *   登录端点据此拒绝,但站点其余部分不受影响(2026-11-06 撞库加固)
 * - 网络异常按失败处理,不抛未捕获(第三方抖动不阻断登录流程,由调用方统一 422)
 */
export async function verifyTurnstile(token: string, remoteIp?: string): Promise<TurnstileResult> {
  const ts = (await getConfig()).turnstile;
  if (ts.misconfigured) {
    return { ok: false, errors: ["not-configured"], configured: false };
  }
  if (!ts.enabled) {
    return { ok: true, configured: false };
  }
  if (!token) {
    return { ok: false, errors: ["missing-input-response"], configured: true };
  }
  try {
    const body = new URLSearchParams({
      secret: ts.secretKey,
      response: token,
    });
    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, errors: [`http-${res.status}`], configured: true };
    }
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    return {
      ok: data.success === true,
      errors: data["error-codes"],
      configured: true,
    };
  } catch {
    return { ok: false, errors: ["network-error"], configured: true };
  }
}
