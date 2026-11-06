# Contract: api-auth-m4（人机校验 + 限速语义）

> 2026-11-07 订正:人机校验厂商由 Cloudflare Turnstile 换为腾讯云验证码 TCaptcha,请求体字段与错误码随之更名
> （`turnstileToken` → `captchaTicket`+`captchaRandstr`;`TURNSTILE_FAILED` → `CAPTCHA_FAILED`;
> `TURNSTILE_UNAVAILABLE` → `CAPTCHA_UNAVAILABLE`）。限流流程本身已被 2026-11-06 撞库加固 PR-A~PR-J 改写
> （IP 维解耦 / 可信客户端 IP / 并发闸 / 全局哈希预算),本契约的「前置流程」章节已滞后,以代码与
> `docs/plan/development-plan.md` 变更记录为准。

**Branch**: `004-m4-polish` | 依赖: research R1/R2/R13, data-model §2/§3

## 变更端点

### POST /api/auth/login

请求体扩展：

```jsonc
{
  "username": "string(1-32)",
  "password": "string(1-256)",
  "remember": "boolean = false",
  "captchaTicket": "string? // captcha.enabled=true 时必填（腾讯云验证码票据）",
  "captchaRandstr": "string? // captcha.enabled=true 时必填（腾讯云验证码随机串）"
}
```

响应/错误：

| 状态 | code | 场景 |
|---|---|---|
| 401 | INVALID_CREDENTIALS | 凭据失败（M1 统一模糊文案不变） |
| 422 | CAPTCHA_FAILED | 无票据 / 票据校验不通过——**不计入**登录失败计数 |
| 422 | CAPTCHA_UNAVAILABLE | 已启用但四件套密钥缺失（运维误配，失败关闭） |
| 429 | LOGIN_LOCKED | 锁定期内（文案统一「尝试过于频繁」，不区分账号/IP 维度）；body 附 `retryAfterSec` |
| 429 | RATE_LIMITED | 失败计数达阈值（当次请求即拒绝并置锁）；body 附 `retryAfterSec` |

### POST /api/auth/register

请求体扩展 `captchaTicket`+`captchaRandstr`（同上语义）；注册无失败锁定（R2），仅人机校验拦截。

## 前置流程（路由层顺序）

1. 锁键检查（命中→429 LOGIN_LOCKED）
2. 腾讯云验证码票据校验 DescribeCaptchaResult（enabled=true 时；失败→422，不计失败；第三方不可达按官方容灾方案降级放行并落 CAPTCHA_DEGRADED 审计）
3. 凭据校验（loginWithPassword 原样）
4. 失败→双维 INCR（username 原串 + XFF 存在时的 ip），达阈值 SET 锁 + 审计 LOGIN_LOCKED → 429 RATE_LIMITED
5. 成功→清计数与锁键

## 服务端下发

- 登录/注册页（RSC）读 config：`{ captchaEnabled: boolean, captchaAppId: string }` 传表单 props；appSecret/secretKey/secretId 永不出后端。

## 测试口径

- 集成：enabled=false 直通（schema 不带票据也过）；enabled=true 无票据→422；票据判定不通过→422；连续失败 N→第 N+1 次 429 且锁键存在→锁期内再试 429；过期窗口后恢复 200；审计 LOGIN_LOCKED 落行
- 防枚举：不存在用户名同样计数与锁定，401/429 文案与真实用户无差异
