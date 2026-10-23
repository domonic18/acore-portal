# Contract: SOAP 命令通道（soap-channel）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-022~FR-023 / US6 | 实现层：`src/server/soap/`；M2 商城发货/角色服务复用同一通道。

## execute(command, args, options)

统一入口签名（TypeScript）：

```ts
type SoapResult =
  | { status: "success"; output: string; durationMs: number; callId: number }
  | { status: "failed"; error: string; attempts: number; callId: number };

execute(
  command: SoapCommand,            // 仅允许 constants/soap-commands.ts 白名单命令
  args: string[],                  // Zod 校验后的参数
  options: {
    idempotencyKey: string;        // 调用方生成，全局唯一
    idempotent: boolean;           // 命令是否天然幂等 → 决定自动重试策略
    requestedBy: string;           // 触发来源标识
    timeoutMs?: number;            // 默认 5000
  }
): Promise<SoapResult>
```

**命令白名单**（`src/constants/soap-commands.ts`，M1 仅只读验证）：

| 命令 | 幂等 | M1 用途 |
|------|------|---------|
| `.server info` | 是（只读） | US6 通道验证 + 健康自检 |
| （M2 追加：send items / ban / character service 类，非幂等走失败转队列） | | |

## 行为规则

1. **落库先行**：每次调用先插 `soap_call`（status=pending, idempotency_key 唯一索引）；同 key 重复请求直接返回首次结果（幂等防重复投递，spec 边缘场景 8）
2. **超时**：默认 5s，超时按失败处理
3. **重试**：`idempotent=true` 自动重试 ≤3 次指数退避（1s/2s/4s）；非幂等命令失败不自动重试，返回 failed 由调用方转队列/人工
4. **审计**：每次尝试（成功与失败）写 `soap_call.attempts` 递增 + `audit_log(category=soap)`；记录命令/参数/结果摘要/耗时/attempt 序号（US6 场景 2）
5. **连接自检**：`lib/db` 五 client + SOAP client 提供健康检查（FR-022 场景 3：启动时四库均可达）；SOAP 不阻塞启动（worldserver 可能未开），仅标记 degraded
6. **安全**：SOAP 凭据仅 env（`SOAP_USER/SOAP_PASSWORD`）；命令白名单外一律拒绝（防注入拼接）；参数不含用户可控原始串进入命令行——组装前过 Zod 与白名单映射

## 通道凭据与拓扑

- worldserver soap 端点：`SOAP_URL`（生产 `http://127.0.0.1:7878/` 内网）；应用与游戏服同机部署或内网互通
- dev 环境：SOAP mock（research R10）模拟正常/超时/失败三态，供 E2E 与重试路径测试
