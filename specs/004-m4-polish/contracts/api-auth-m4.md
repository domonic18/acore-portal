# Contract: api-auth-m4（Turnstile + 限速语义）

**Branch**: `004-m4-polish` | 依赖: research R1/R2/R13, data-model §2/§3

## 变更端点

### POST /api/auth/login

请求体扩展：

```jsonc
{
  "username": "string(1-32)",
  "password": "string(1-256)",
  "remember": "boolean = false",
  "turnstileToken": "string? // turnstile.enabled=true 时必填"
}
```

响应/错误：

| 状态 | code | 场景 |
|---|---|---|
| 401 | INVALID_CREDENTIALS | 凭据失败（M1 统一模糊文案不变） |
| 422 | TURNSTILE_FAILED | 无 token / siteverify 失败 / 超时——**不计入**登录失败计数 |
| 429 | LOGIN_LOCKED | 锁定期内（文案统一「尝试过于频繁」，不区分账号/IP 维度）；body 附 `retryAfterSec` |
| 429 | RATE_LIMITED | 失败计数达阈值（当次请求即拒绝并置锁）；body 附 `retryAfterSec` |

### POST /api/auth/register

请求体扩展 `turnstileToken`（同上语义）；注册无失败锁定（R2），仅 Turnstile 拦截。

## 前置流程（路由层顺序）

1. 锁键检查（命中→429 LOGIN_LOCKED）
2. Turnstile siteverify（enabled=true 时；失败→422，不计失败）
3. 凭据校验（loginWithPassword 原样）
4. 失败→双维 INCR（username 原串 + XFF 存在时的 ip），达阈值 SET 锁 + 审计 LOGIN_LOCKED → 429 RATE_LIMITED
5. 成功→清计数与锁键

## 服务端下发

- 登录/注册页（RSC）读 config：`{ turnstileEnabled: boolean, turnstileSiteKey: string | null }` 传表单 props；secretKey 永不出后端。

## 测试口径

- 集成：enabled=false 直通（schema 不带 token 也过）；enabled=true 无 token→422；恒失败测试密钥→422；连续失败 N→第 N+1 次 429 且锁键存在→锁期内再试 429；过期窗口后恢复 200；审计 LOGIN_LOCKED 落行
- 防枚举：不存在用户名同样计数与锁定，401/429 文案与真实用户无差异
