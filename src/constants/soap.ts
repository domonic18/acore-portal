/**
 * SOAP 命令注册表(issue #82 单一真相源):
 * 命令白名单 + 幂等性 + 超时/重试元数据一处登记;执行层从注册表读,
 * 不再各自硬编码(旧 constants/soap.ts 与 constants/soap-commands.ts 双份已合并)。
 */
export const SOAP_COMMANDS = {
  SERVER_INFO: ".server info",
  SEND_ITEMS: ".send items",
  TRANSMOG_ADD: ".transmog add",
  CHARACTER_CHANGERACE: ".character changerace",
  CHARACTER_CHANGEFACTION: ".character changefaction",
  CHARACTER_CUSTOMIZE: ".character customize",
  CHARACTER_RENAME: ".character rename",
} as const;

export type SoapCommand = (typeof SOAP_COMMANDS)[keyof typeof SOAP_COMMANDS];

/** SOAP 基础超时(ms) */
export const SOAP_TIMEOUT_MS = 5000;

/**
 * 幂等命令自动重试退避(ms):契约规则3「重试 ≤3 次,指数退避 1s/2s/4s」
 * (schema 注释"≤3"按契约勘误为共 4 次尝试);非幂等命令不自动重发。
 */
export const SOAP_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

export type SoapCommandMeta = {
  /** 天然幂等 → 允许自动重试;非幂等命令重发有重复副作用风险 */
  idempotent: boolean;
  timeoutMs: number;
  retryDelaysMs: readonly number[];
};

export const SOAP_COMMAND_REGISTRY: Record<SoapCommand, SoapCommandMeta> = {
  [SOAP_COMMANDS.SERVER_INFO]: {
    idempotent: true,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: SOAP_RETRY_DELAYS_MS,
  },
  [SOAP_COMMANDS.SEND_ITEMS]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
  [SOAP_COMMANDS.TRANSMOG_ADD]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
  [SOAP_COMMANDS.CHARACTER_CHANGERACE]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
  [SOAP_COMMANDS.CHARACTER_CHANGEFACTION]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
  [SOAP_COMMANDS.CHARACTER_CUSTOMIZE]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
  [SOAP_COMMANDS.CHARACTER_RENAME]: {
    idempotent: false,
    timeoutMs: SOAP_TIMEOUT_MS,
    retryDelaysMs: [],
  },
};

const ALLOWED_COMMANDS = new Set<string>(Object.keys(SOAP_COMMAND_REGISTRY));

/** 白名单判定:精确匹配命令本体,白名单外一律拒绝(防注入拼接) */
export function isSoapCommandAllowed(command: string): command is SoapCommand {
  return ALLOWED_COMMANDS.has(command);
}

/** 注册表元数据(命令已在白名单内时调用) */
export function soapCommandMeta(command: SoapCommand): SoapCommandMeta {
  return SOAP_COMMAND_REGISTRY[command];
}

/** soap_call 作业状态(Prisma SoapStatus):落库即 pending,终态 success/failed/unknown */
export const SOAP_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
  /** 超时/响应不可解析:游戏端可能已执行,同键重投递只回放不重发(issue #67) */
  UNKNOWN: "unknown",
} as const;

export type SoapStatusValue = (typeof SOAP_STATUS)[keyof typeof SOAP_STATUS];
