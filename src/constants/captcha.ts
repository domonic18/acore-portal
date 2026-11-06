/**
 * 人机校验(腾讯云验证码 TCaptcha)对外契约(2026-11-07 由 Turnstile 替换):
 * 登录与注册共用同一组错误码与文案,避免两处漂移。
 * - FAILED:票据校验未通过(含缺票据/判定为机器人),调用方应让用户重试
 * - UNAVAILABLE:已启用但配置缺失(运维误配)→ 失败关闭,提示稍后再试
 */
export const CAPTCHA_ERROR = {
  FAILED: { code: "CAPTCHA_FAILED", message: "人机验证未通过,请重试。" },
  UNAVAILABLE: { code: "CAPTCHA_UNAVAILABLE", message: "人机验证服务暂不可用,请稍后再试。" },
} as const;
