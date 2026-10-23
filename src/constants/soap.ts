/**
 * SOAP 命令白名单(contracts/soap-channel.md)
 * 白名单外一律拒绝;新增命令必须在此登记并标注幂等性
 */
export const SOAP_COMMANDS = {
  SERVER_INFO: ".server info",
} as const;

export type SoapCommandValue = (typeof SOAP_COMMANDS)[keyof typeof SOAP_COMMANDS];

/** 幂等性映射:true = 天然幂等 → 允许自动重试 ≤3 次 */
export const SOAP_COMMAND_IDEMPOTENT: Record<string, boolean> = {
  [SOAP_COMMANDS.SERVER_INFO]: true,
};

export const SOAP_TIMEOUT_MS = 5000;
export const SOAP_MAX_ATTEMPTS = 3;
/** 指数退避基数(ms):1s/2s/4s */
export const SOAP_RETRY_BACKOFF_MS = 1000;
