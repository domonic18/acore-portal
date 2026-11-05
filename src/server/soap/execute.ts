import "server-only";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/server/http";
import { writeAudit } from "@/server/services/shared/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  isSoapCommandAllowed,
  soapCommandMeta,
  SOAP_STATUS,
  type SoapCommand,
} from "@/constants/soap";
import { rawExecuteCommand, SoapOutcomeUnknownError } from "./client";

const DIGEST_MAX = 500;
/** 同幂等键撞上首个 pending 时的等待上限:等待对方终态后回放首次结果 */
const DEDUPE_WAIT_TOTAL_MS = 30_000;
const DEDUPE_POLL_INTERVAL_MS = 250;

export type SoapResult =
  | { status: "success"; output: string; durationMs: number; callId: number }
  | {
      status: "failed";
      error: string;
      attempts: number;
      callId: number;
      /** unknown=结果未知(超时/响应不可解析):游戏端可能已执行,已门控禁止自动重发(issue #67) */
      outcome?: "unknown";
    };

export type SoapExecuteOptions = {
  idempotencyKey: string;
  /** 命令是否天然幂等 → 决定自动重试策略(契约:调用方声明) */
  idempotent: boolean;
  requestedBy: string;
  timeoutMs?: number;
  /** 测试注入:覆盖默认指数退避间隔,其余场景勿用 */
  retryDelaysMs?: number[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 防注入:白名单精确匹配命令本体;参数仅剔除控制字符防 smuggling,内容由上游 Zod 保证 */
function assembleCommand(command: SoapCommand, args: string[]): string {
  const clean = args.map((a) => a.replace(/[\u0000-\u001f\u007f]/g, "").trim());
  return [command, ...clean].join(" ").trim();
}

async function insertPendingCall(
  command: SoapCommand,
  args: string[],
  options: SoapExecuteOptions,
) {
  try {
    return await prisma.soapCall.create({
      data: {
        idempotencyKey: options.idempotencyKey,
        command,
        argsJson: args,
        status: SOAP_STATUS.PENDING,
        requestedBy: options.requestedBy,
      },
    });
  } catch (err) {
    // 落库先行 + 唯一键:同 key 已存在 → 走首次结果回放(防重复投递,边缘场景 8)
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

async function waitForFirstCall(idempotencyKey: string) {
  const deadline = Date.now() + DEDUPE_WAIT_TOTAL_MS;
  for (;;) {
    const row = await prisma.soapCall.findUnique({ where: { idempotencyKey } });
    if (!row) throw new Error("soap_call 首次记录缺失(异常状态)");
    if (row.status !== SOAP_STATUS.PENDING || Date.now() >= deadline) return row;
    await sleep(DEDUPE_POLL_INTERVAL_MS);
  }
}

function replayFirstResult(row: {
  id: bigint;
  status: string;
  resultDigest: string | null;
  lastError: string | null;
  attempts: number;
  durationMs: number | null;
}): SoapResult {
  if (row.status === SOAP_STATUS.SUCCESS) {
    // 回放的是 result_digest(≤500 摘要);M1 输出均在界内,与原结果一致
    return {
      status: "success",
      output: row.resultDigest ?? "",
      durationMs: row.durationMs ?? 0,
      callId: Number(row.id),
    };
  }
  if (row.status === SOAP_STATUS.UNKNOWN) {
    return {
      status: "failed",
      error: `结果未知(超时或响应不可解析),已禁止自动重发,待人工核对: ${row.lastError ?? ""}`,
      attempts: row.attempts,
      callId: Number(row.id),
      outcome: "unknown",
    };
  }
  return {
    status: "failed",
    error:
      row.status === SOAP_STATUS.FAILED
        ? (row.lastError ?? "unknown")
        : "首次调用仍在执行,请稍后用同一幂等键重试获取首次结果",
    attempts: row.attempts,
    callId: Number(row.id),
  };
}

export async function executeSoapCommand(
  command: string,
  args: string[],
  options: SoapExecuteOptions,
): Promise<SoapResult> {
  // 白名单外拒绝且不落库(契约规则6:不产生任何执行痕迹之外的开销)
  if (!isSoapCommandAllowed(command)) {
    throw new Error(`SOAP 命令白名单外,已拒绝: ${command}`);
  }
  const meta = soapCommandMeta(command);
  const timeoutMs = options.timeoutMs ?? meta.timeoutMs;

  let own = await insertPendingCall(command, args, options);
  if (!own) {
    // 同键已有记录:success/pending/unknown → 回放首次结果(unknown 门控不重发);
    // failed=确定性失败(游戏端未执行),删旧行后本进程重新占位执行,痕迹保留在 audit_log
    const existing = await waitForFirstCall(options.idempotencyKey);
    if (existing.status !== SOAP_STATUS.FAILED) {
      return replayFirstResult(existing);
    }
    await prisma.soapCall.delete({ where: { id: existing.id } });
    own = await insertPendingCall(command, args, options);
    if (!own) {
      // 并发对手也在删行重占位:等其终态回放
      return replayFirstResult(await waitForFirstCall(options.idempotencyKey));
    }
  }

  const retryDelays = options.idempotent
    ? (options.retryDelaysMs ?? [...meta.retryDelaysMs])
    : [];
  const totalAttempts = 1 + retryDelays.length;
  const startedAt = Date.now();
  let lastError = "";
  let attemptsMade = 0;
  let outcomeUnknown = false;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const attemptStart = Date.now();
    let output = "";
    let ok = false;
    attemptsMade = attempt;
    try {
      output = await rawExecuteCommand(assembleCommand(command, args), timeoutMs);
      ok = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof SoapOutcomeUnknownError) outcomeUnknown = true;
    }
    const attemptMs = Date.now() - attemptStart;

    await writeAudit({
      category: AUDIT_CATEGORY.SOAP,
      action: AUDIT_ACTION.SOAP_ATTEMPT,
      payload: {
        command,
        args,
        attempt,
        ok,
        durationMs: attemptMs,
        key: options.idempotencyKey,
        requestedBy: options.requestedBy,
        ...(ok ? { digest: output.slice(0, 200) } : { error: lastError.slice(0, 200) }),
      },
    });

    if (ok) {
      const durationMs = Date.now() - startedAt;
      await prisma.soapCall.update({
        where: { id: own.id },
        data: {
          status: SOAP_STATUS.SUCCESS,
          resultDigest: output.slice(0, DIGEST_MAX),
          attempts: attempt,
          durationMs,
          finishedAt: new Date(),
        },
      });
      return { status: "success", output, durationMs, callId: Number(own.id) };
    }
    // 结果未知:命令可能已在游戏端执行,立即中止自动重试(重发有重复副作用,issue #67)
    if (outcomeUnknown) break;
    if (attempt < totalAttempts) {
      await sleep(retryDelays[attempt - 1] ?? 0);
    }
  }

  const durationMs = Date.now() - startedAt;
  await prisma.soapCall.update({
    where: { id: own.id },
    data: {
      status: outcomeUnknown ? SOAP_STATUS.UNKNOWN : SOAP_STATUS.FAILED,
      lastError: lastError.slice(0, DIGEST_MAX),
      attempts: attemptsMade,
      durationMs,
      finishedAt: new Date(),
    },
  });
  return {
    status: "failed",
    error: lastError,
    attempts: attemptsMade,
    callId: Number(own.id),
    ...(outcomeUnknown ? { outcome: "unknown" as const } : {}),
  };
}
