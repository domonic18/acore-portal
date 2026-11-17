import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { getConfig, reloadSystemConfig } from "@/lib/config";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup as saveGroup } from "@/server/services/settings/save";
import {
  probeLlmChat,
  probeLlmEmbedding,
} from "@/server/services/assistant/llm-probe";

/**
 * AI 模型通道组(M8/M9)集成:
 * 组级保存与热生效 / 密钥只写不读(空=保持) / 视图零明文 /
 * 探针在配置不齐与通道不通时返回业务失败(不抛错、不 5xx)。
 * system_config 共享键:用前快照、用后还原。
 */

const ADMIN_ID = 3n;
const LLM_KEYS = [
  "llm.provider",
  "llm.baseUrl",
  "llm.apiKey",
  "llm.model",
  "llm.dailyQuota",
  "llm.embeddingBaseUrl",
  "llm.embeddingModel",
  "llm.embeddingApiKey",
];

let backup: { key: string; value: string }[] = [];

beforeAll(async () => {
  backup = await prisma.systemConfig.findMany({
    where: { key: { in: LLM_KEYS } },
    select: { key: true, value: true },
  });
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: LLM_KEYS } } });
  if (backup.length > 0) {
    await prisma.systemConfig.createMany({ data: backup });
  }
  await reloadSystemConfig();
  await prisma.auditLog.deleteMany({
    where: { action: "settings_changed", actorUserId: ADMIN_ID },
  });
  await prisma.$disconnect();
});

describe("AI 模型通道组设置", () => {
  it("保存后热生效:对话三件套 + 向量三件套落库并进配置", async () => {
    const res = await saveGroup(
      "llm",
      {
        provider: "anthropic",
        baseUrl: "https://gw.example.com/v1",
        apiKey: "sk-chat-secret",
        model: "claude-sonnet-4-5",
        dailyQuota: 12,
        embeddingBaseUrl: "https://gw.example.com/v1",
        embeddingModel: "bge-m3",
        embeddingApiKey: "sk-embed-secret",
      },
      { id: ADMIN_ID },
    );
    expect(res.ok).toBe(true);

    const config = await getConfig();
    expect(config.llm.provider).toBe("anthropic");
    expect(config.llm.baseUrl).toBe("https://gw.example.com/v1");
    expect(config.llm.model).toBe("claude-sonnet-4-5");
    expect(config.llm.dailyQuota).toBe(12);
    expect(config.llm.embeddingModel).toBe("bge-m3");
  });

  it("视图零明文:密钥只回「已配置」布尔", async () => {
    const view = await getSettingsView();
    expect(view.llm.apiKeyConfigured).toBe(true);
    expect(view.llm.embeddingApiKeyConfigured).toBe(true);
    expect(JSON.stringify(view)).not.toContain("sk-chat-secret");
    expect(JSON.stringify(view)).not.toContain("sk-embed-secret");
  });

  it("密钥留空=保持原值(不回写空串)", async () => {
    const res = await saveGroup(
      "llm",
      { provider: "openai", baseUrl: "https://gw2.example.com/v1", apiKey: "", model: "gpt-x" },
      { id: ADMIN_ID },
    );
    expect(res.ok).toBe(true);
    const config = await getConfig();
    expect(config.llm.apiKey).toBe("sk-chat-secret");
    expect(config.llm.baseUrl).toBe("https://gw2.example.com/v1");
    expect(config.llm.model).toBe("gpt-x");
  });

  it("审计只落键名不落值", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { action: "settings_changed", actorUserId: ADMIN_ID },
      orderBy: { id: "desc" },
      select: { payloadJson: true },
    });
    expect(audit).not.toBeNull();
    const payload = JSON.stringify(audit!.payloadJson);
    expect(payload).toContain("llm");
    expect(payload).not.toContain("sk-chat-secret");
    expect(payload).not.toContain("gw2.example.com");
  });
});

describe("AI 通道探针", () => {
  it("三项不齐即业务失败,不发起请求", async () => {
    const chat = await probeLlmChat({ provider: "openai", baseUrl: "", apiKey: "k", model: "m" });
    expect(chat.ok).toBe(false);
    expect(chat.message).toContain("须齐全");

    const embed = await probeLlmEmbedding({ baseUrl: "https://x/v1", apiKey: "", model: "m" });
    expect(embed.ok).toBe(false);
    expect(embed.message).toContain("须齐全");
  });

  it("通道不通返回业务失败(不抛错、不泄响应体)", async () => {
    // 127.0.0.1:9 = discard 端口,必然连不通
    const res = await probeLlmChat({
      provider: "openai",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "k",
      model: "m",
    });
    expect(res.ok).toBe(false);
    expect(res.message.length).toBeGreaterThan(0);
    expect(res.message).not.toContain("sk-");
  });
});
