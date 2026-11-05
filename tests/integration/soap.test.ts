import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { prisma } from "../../src/lib/db";
import { executeSoapCommand } from "../../src/server/soap/execute";
import { loadSystemConfig } from "../../src/lib/config";

/**
 * T048 US6 SOAP 通道集成测试(quickstart S6,打 soap-mock):
 * 成功留痕 / 超时结果未知门控不重试(issue #67) / 同幂等键回放首次结果 / 白名单外拒绝不落库 / 非幂等失败不重试。
 * 测试结束恢复 mock mode=normal;数据按 key 前缀清理。
 */
const KEY_PREFIX = `it-soap-${Date.now().toString(36)}`;
let MOCK_BASE = "";

async function setMockMode(mode: "normal" | "timeout" | "failure") {
  const res = await fetch(`${MOCK_BASE}/__mode?mode=${mode}`);
  if (!res.ok) throw new Error(`soap-mock 不可达(${MOCK_BASE}),请先启动 docker dev 栈`);
}

async function auditRows(key: string) {
  return prisma.auditLog.findMany({
    where: { category: "soap", payloadJson: { path: "$.key", equals: key } },
    orderBy: { id: "asc" },
  });
}

beforeAll(async () => {
  MOCK_BASE = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await setMockMode("normal");
});

afterEach(async () => {
  await setMockMode("normal");
});

afterAll(async () => {
  await setMockMode("normal");
  await prisma.soapCall.deleteMany({
    where: { idempotencyKey: { startsWith: KEY_PREFIX } },
  });
  await prisma.$executeRaw`
    DELETE FROM audit_log
    WHERE category = 'soap'
      AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.key')) LIKE ${`${KEY_PREFIX}%`}
  `;
  await prisma.$disconnect();
});

describe("US6 SOAP 通道(quickstart S6)", () => {
  test("成功执行 .server info → soap_call success + 审计留痕", async () => {
    const key = `${KEY_PREFIX}-ok`;
    const res = await executeSoapCommand(".server info", [], {
      idempotencyKey: key,
      idempotent: true,
      requestedBy: "integration",
    });

    expect(res.status).toBe("success");
    if (res.status === "success") {
      expect(res.output).toContain("AzerothCore");
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
    }

    const row = await prisma.soapCall.findUniqueOrThrow({ where: { idempotencyKey: key } });
    expect(row.status).toBe("success");
    expect(row.attempts).toBe(1);
    expect(row.resultDigest).toContain("AzerothCore");
    expect(row.finishedAt).not.toBeNull();

    const audits = await auditRows(key);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("soap_attempt");
    expect(audits[0]?.payloadJson).toMatchObject({ attempt: 1, ok: true, key });
  });

  test("超时 → 结果未知:落 unknown 终态不自动重试,同键重投递门控回放(issue #67)", async () => {
    const key = `${KEY_PREFIX}-timeout`;
    await setMockMode("timeout");
    const res = await executeSoapCommand(".server info", [], {
      idempotencyKey: key,
      idempotent: true,
      requestedBy: "integration",
      timeoutMs: 400,
      retryDelaysMs: [50, 50, 50],
    });

    expect(res.status).toBe("failed");
    if (res.status === "failed") {
      expect(res.outcome).toBe("unknown");
      expect(res.attempts).toBe(1); // 未知立即中止,即使幂等命令也不自动重试
      expect(res.error).toContain("超时");
    }

    const row = await prisma.soapCall.findUniqueOrThrow({ where: { idempotencyKey: key } });
    expect(row.status).toBe("unknown");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("超时");
    expect(row.finishedAt).not.toBeNull();

    const audits = await auditRows(key);
    expect(audits).toHaveLength(1);

    // mock 恢复后同键重投递:仍不重发,回放 unknown 门控结果
    await setMockMode("normal");
    const replay = await executeSoapCommand(".server info", [], {
      idempotencyKey: key,
      idempotent: true,
      requestedBy: "integration",
    });
    expect(replay.status).toBe("failed");
    if (replay.status === "failed") {
      expect(replay.outcome).toBe("unknown");
      expect(replay.error).toContain("禁止自动重发");
    }
    expect(await auditRows(key)).toHaveLength(1); // 无新执行痕迹
  }, 20_000);

  test("同幂等键重复投递 → 不重复执行,返回首次结果", async () => {
    const key = `${KEY_PREFIX}-dedupe`;
    const options = { idempotencyKey: key, idempotent: true, requestedBy: "integration" };
    const first = await executeSoapCommand(".server info", [], options);
    expect(first.status).toBe("success");

    const second = await executeSoapCommand(".server info", [], options);
    expect(second).toEqual(first);

    const rows = await prisma.soapCall.findMany({ where: { idempotencyKey: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(1);

    const audits = await auditRows(key);
    expect(audits).toHaveLength(1);
  });

  test("白名单外命令拒绝且不落库", async () => {
    const key = `${KEY_PREFIX}-whitelist`;
    await expect(
      executeSoapCommand(".announce hacked", [], {
        idempotencyKey: key,
        idempotent: false,
        requestedBy: "integration",
      }),
    ).rejects.toThrow(/白名单/);

    expect(
      await prisma.soapCall.findMany({ where: { idempotencyKey: key } }),
    ).toHaveLength(0);
    expect(await auditRows(key)).toHaveLength(0);
  });

  test("非幂等命令失败不重试(attempts=1)", async () => {
    const key = `${KEY_PREFIX}-nonidem`;
    await setMockMode("failure");
    const res = await executeSoapCommand(".server info", [], {
      idempotencyKey: key,
      idempotent: false,
      requestedBy: "integration",
      timeoutMs: 2000,
    });

    expect(res.status).toBe("failed");
    if (res.status === "failed") {
      expect(res.attempts).toBe(1);
      expect(res.error).toContain("mock failure mode");
    }
    expect(await auditRows(key)).toHaveLength(1);
  });

  test("幂等命令遇 Fault 同样自动重试", async () => {
    const key = `${KEY_PREFIX}-fault-retry`;
    await setMockMode("failure");
    const res = await executeSoapCommand(".server info", [], {
      idempotencyKey: key,
      idempotent: true,
      requestedBy: "integration",
      timeoutMs: 2000,
      retryDelaysMs: [20, 20, 20],
    });

    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.attempts).toBe(4);
    expect(await auditRows(key)).toHaveLength(4);
  }, 20_000);
});
