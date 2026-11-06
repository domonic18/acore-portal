/**
 * 人机校验(Turnstile)对外契约(2026-11-06 撞库加固):
 * 登录与注册共用同一组错误码与文案,避免两处漂移。
 * - FAILED:校验未通过(含缺 token/第三方报错),调用方应让用户重试
 * - UNAVAILABLE:已启用但密钥缺失(运维误配)→ 失败关闭,提示稍后再试
 */
export const TURNSTILE_ERROR = {
  FAILED: { code: "TURNSTILE_FAILED", message: "人机验证未通过,请重试。" },
  UNAVAILABLE: { code: "TURNSTILE_UNAVAILABLE", message: "人机验证服务暂不可用,请稍后再试。" },
} as const;
