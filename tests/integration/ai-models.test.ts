import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION } from "@/constants/audit";
import { createSession } from "@/lib/auth/session";
import {
  createAiModel,
  deleteAiModel,
  listAiModelsAdmin,
  setAiModelEnabled,
  updateAiModel,
} from "@/server/services/shared/ai-models/crud";
import { updateRoleBinding } from "@/server/services/shared/ai-models/bindings";
import { resolveAiModel, resolveChatBinding } from "@/server/services/shared/ai-models/resolver";
import { probeAiModelCandidate, testStoredAiModel } from "@/server/services/shared/ai-models/probe";
import { GET as modelsGet, POST as modelsPost } from "@/app/api/admin/ai-models/route";
import { DELETE as modelDelete } from "@/app/api/admin/ai-models/[id]/route";
import { GET as bindingsGet, PUT as bindingsPut } from "@/app/api/admin/ai-models/bindings/route";

/**
 * AI 模型注册表集成(服务层 + 路由层契约):
 * CRUD 往返(apiKey 只写不读/空提交保留旧值/端点剥尾缀)、删除被绑定引用 409、
 * 绑定校验(SAME_MODEL/DISABLED/ROLE_MISMATCH/PROTOCOL_MISMATCH)、resolver 静态选边真库、
 * 探针(缺 key/base 提示、mock fetch 双协议路径、通道不通不抛错、已存测试落 last_test_* + 审计)。
 *
 * 绑定行是全局配置:本文件改完必须在 afterAll 原样还原,新建条目全部删除。
 */
const RUN = Date.now().toString(36);
const ADMIN = `aimodeladmin${RUN}`;
const KEY_A = `sk-live-secret-${RUN}`;

let adminId = 0n;
let userId = 0n;
const createdIds: number[] = [];
let chatAId = 0; // openai 对话条目(主力)
let anthropicChatId = 0; // anthropic 对话条目(备用)

type BindingSnapshot = { role: string; primaryId: number | null; backupId: number | null; dailyTokenMax: number };
let bindingSnapshot: BindingSnapshot[] = [];

async function adminReq(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
  who: { id: bigint; role: "admin" | "user" } = { id: adminId, role: "admin" },
): Promise<NextRequest> {
  const { accessToken } = await createSession(who.id, who.role);
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: new Headers({
      "content-type": "application/json",
      cookie: `${SESSION.ACCESS_COOKIE}=${accessToken}`,
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function errorBody(res: Response): Promise<{ code: string; message: string }> {
  const json = (await res.json()) as { error?: { code?: string; message?: string } };
  return { code: json.error?.code ?? "", message: json.error?.message ?? "" };
}

/** 建一个条目并登记 id(afterAll 统一清理) */
async function makeModel(input: {
  name: string;
  provider?: string;
  protocol?: "openai" | "anthropic";
  modelId: string;
  roles: ("chat" | "embedding")[];
  baseUrl?: string | null;
  apiKey?: string | null;
  enabled?: boolean;
}): Promise<number> {
  const view = await createAiModel(
    {
      name: input.name,
      provider: input.provider ?? "测试网关",
      protocol: input.protocol ?? "openai",
      baseUrl: input.baseUrl ?? null,
      modelId: input.modelId,
      apiKey: input.apiKey ?? null,
      roles: input.roles,
      timeoutSec: 30,
      enabled: input.enabled ?? true,
    },
    adminId,
  );
  createdIds.push(view.id);
  return view.id;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  bindingSnapshot = await prisma.aiRoleBinding.findMany({
    select: { role: true, primaryId: true, backupId: true, dailyTokenMax: true },
  });
  for (const who of [
    { username: ADMIN, role: "admin" as const, email: `aim-${RUN}@t.local` },
    { username: `${ADMIN}u`, role: "user" as const, email: `aimu-${RUN}@t.local` },
  ]) {
    await prisma.user.create({
      data: { username: who.username, role: who.role, email: who.email, passwordHash: "x", passwordAlgo: "phpass" },
    });
  }
  adminId = (await prisma.user.findUniqueOrThrow({ where: { username: ADMIN } })).id;
  userId = (await prisma.user.findUniqueOrThrow({ where: { username: `${ADMIN}u` } })).id;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  // 绑定行原样还原(先还原绑定再删条目,避免 FK SetNull 串改还原值)
  for (const row of bindingSnapshot) {
    await prisma.aiRoleBinding.upsert({
      where: { role: row.role },
      create: row,
      update: { primaryId: row.primaryId, backupId: row.backupId, dailyTokenMax: row.dailyTokenMax },
    });
  }
  await prisma.aiRoleBinding.deleteMany({
    where: { role: { notIn: bindingSnapshot.map((r) => r.role) } },
  });
  await prisma.aiModel.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [adminId, userId] } } });
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN, `${ADMIN}u`] } } });
  await prisma.$disconnect();
});

describe("CRUD 往返(apiKey 只写不读)", () => {
  it("创建:端点剥尾缀落库;脱敏视图不含明文但标记已配置", async () => {
    const view = await createAiModel(
      {
        name: "网关A",
        provider: "测试网关",
        protocol: "openai",
        baseUrl: "  https://gw.test/v1/chat/completions ",
        modelId: "gw-chat-8b",
        apiKey: KEY_A,
        roles: ["chat"],
        timeoutSec: 30,
        enabled: true,
      },
      adminId,
    );
    chatAId = view.id;
    createdIds.push(chatAId);
    const row = await prisma.aiModel.findUniqueOrThrow({ where: { id: view.id } });
    expect(row.baseUrl).toBe("https://gw.test/v1");
    expect(row.apiKey).toBe(KEY_A);

    const json = JSON.stringify(view);
    expect(json).not.toContain(KEY_A);
    expect(view.apiKeyConfigured).toBe(true);
    expect(view.roles).toEqual(["chat"]);
  });

  it("更新:apiKey 空串 = 保留已配置的密钥(明文永不回显故无法被「清空」)", async () => {
    const id = chatAId;
    const view = await updateAiModel(
      id,
      {
        name: "网关A-改",
        provider: "测试网关",
        protocol: "openai",
        baseUrl: "https://gw.test/v1",
        modelId: "gw-chat-8b",
        apiKey: "",
        roles: ["chat"],
        timeoutSec: 30,
        enabled: true,
      },
      adminId,
    );
    const row = await prisma.aiModel.findUniqueOrThrow({ where: { id } });
    expect(row.apiKey).toBe(KEY_A);
    expect(view.apiKeyConfigured).toBe(true);
    expect(view.name).toBe("网关A-改");
  });

  it("列表:含本文件条目且不带明文字段", async () => {
    const views = await listAiModelsAdmin();
    const mine = views.find((v) => v.id === chatAId)!;
    expect(mine.modelId).toBe("gw-chat-8b");
    expect(JSON.stringify(views)).not.toContain(KEY_A);
  });
});

describe("删除保护与绑定校验", () => {
  it("删除被绑定引用的条目 → BINDING_REFERENCED;解绑后可删", async () => {
    const id = await makeModel({ name: "网关B", modelId: "gw-chat-9b", roles: ["chat"] });
    await updateRoleBinding({ role: "chat", primaryId: id, backupId: null, dailyTokenMax: 20 }, adminId);
    await expect(deleteAiModel(id, adminId)).rejects.toMatchObject({
      code: "BINDING_REFERENCED",
    });
    await updateRoleBinding({ role: "chat", primaryId: null, backupId: null, dailyTokenMax: 20 }, adminId);
    await deleteAiModel(id, adminId);
    expect(await prisma.aiModel.findUnique({ where: { id } })).toBeNull();
  });

  it("非法绑定:AiRoleBindingError 分支码(同条目/停用/角色不符/协议不符)", async () => {
    const chatId = chatAId;
    const disabledId = await makeModel({
      name: "停用条目",
      modelId: "gw-off",
      roles: ["chat"],
      enabled: false,
    });
    const embedId = await makeModel({ name: "向量条目", modelId: "emb-3", roles: ["embedding"] });
    const anthropicEmbed = await makeModel({
      name: "双用途anthropic",
      protocol: "anthropic",
      modelId: "cla-like",
      roles: ["chat", "embedding"],
    });

    await expect(
      updateRoleBinding({ role: "chat", primaryId: chatId, backupId: chatId, dailyTokenMax: 20 }, adminId),
    ).rejects.toMatchObject({ code: "SAME_MODEL" });
    await expect(
      updateRoleBinding({ role: "chat", primaryId: disabledId, backupId: null, dailyTokenMax: 20 }, adminId),
    ).rejects.toMatchObject({ code: "MODEL_DISABLED" });
    await expect(
      updateRoleBinding({ role: "chat", primaryId: embedId, backupId: null, dailyTokenMax: 20 }, adminId),
    ).rejects.toMatchObject({ code: "ROLE_MISMATCH" });
    await expect(
      updateRoleBinding({ role: "embedding", primaryId: anthropicEmbed, backupId: null, dailyTokenMax: 20 }, adminId),
    ).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
  });

  it("合法绑定:落库 + 审计(绑定值入 payload,无敏感字段)", async () => {
    const secondChat = await makeModel({
      name: "网关C",
      protocol: "anthropic",
      modelId: "gw-anthropic",
      roles: ["chat"],
    });
    anthropicChatId = secondChat;
    const view = await updateRoleBinding(
      { role: "chat", primaryId: chatAId, backupId: secondChat, dailyTokenMax: 25 },
      adminId,
    );
    expect(view).toEqual({ role: "chat", primaryId: chatAId, backupId: secondChat, dailyTokenMax: 25 });
    const row = await prisma.aiRoleBinding.findUniqueOrThrow({ where: { role: "chat" } });
    expect(row.primaryId).toBe(chatAId);
    expect(row.backupId).toBe(secondChat);
    expect(row.dailyTokenMax).toBe(25);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: adminId, action: AUDIT_ACTION.AI_ROLE_BINDING_CHANGED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({ role: "chat", primaryId: chatAId, dailyTokenMax: 25 });
    expect(JSON.stringify(audit.payloadJson)).not.toContain(KEY_A);
  });
});

describe("resolver 静态选边(真库)", () => {
  it("主力启用 → primary;停用主力 → backup;双停用 → null;恢复 → primary", async () => {
    const primary = await resolveAiModel("chat");
    expect(primary?.source).toBe("primary");
    expect(primary?.id).toBe(chatAId);
    expect(primary?.apiKey).toBe(KEY_A); // 服务端内部流转可用明文

    await setAiModelEnabled(chatAId, false, adminId);
    expect((await resolveAiModel("chat"))?.source).toBe("backup");
    expect((await resolveAiModel("chat"))?.id).toBe(anthropicChatId);

    await setAiModelEnabled(anthropicChatId, false, adminId);
    expect(await resolveAiModel("chat")).toBeNull();

    const statusAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: adminId, action: AUDIT_ACTION.AI_MODEL_STATUS_CHANGED },
      orderBy: { id: "desc" },
    });
    expect(statusAudit.payloadJson).toMatchObject({ id: anthropicChatId, enabled: false });

    await setAiModelEnabled(chatAId, true, adminId);
    await setAiModelEnabled(anthropicChatId, true, adminId);
    expect((await resolveAiModel("chat"))?.source).toBe("primary");
  });

  it("embedding 角色绑定后可解析;resolveChatBinding 一次带回 chat 上限", async () => {
    const embedId = await makeModel({
      name: "向量网关",
      modelId: "embedding-3",
      roles: ["embedding"],
      baseUrl: "https://emb.test/api/paas/v4",
      apiKey: `sk-emb-${RUN}`,
    });
    await updateRoleBinding(
      { role: "embedding", primaryId: embedId, backupId: null, dailyTokenMax: 20 },
      adminId,
    );
    const resolved = await resolveAiModel("embedding");
    expect(resolved?.source).toBe("primary");
    expect(resolved?.protocol).toBe("openai");
    const chat = await resolveChatBinding();
    expect(chat.dailyTokenMax).toBe(25);
    expect(chat.model?.source).toBe("primary");
  });
});

describe("探针", () => {
  it("缺 API Key / 向量缺 Base URL → 即时失败提示(不发请求)", async () => {
    const noKey = await probeAiModelCandidate({
      protocol: "openai",
      role: "chat",
      baseUrl: "https://gw.test/v1",
      apiKey: null,
      modelId: "m",
    });
    expect(noKey.ok).toBe(false);
    expect(noKey.message).toContain("API Key");

    const noBase = await probeAiModelCandidate({
      protocol: "openai",
      role: "embedding",
      baseUrl: null,
      apiKey: "sk-x",
      modelId: "m",
    });
    expect(noBase.ok).toBe(false);
    expect(noBase.message).toContain("Base URL");
  });

  it("双协议探测路径与请求头(mock fetch):openai /chat/completions + Bearer,anthropic /v1/messages + x-api-key", async () => {
    type FetchArgs = [url: RequestInfo | URL, init?: RequestInit];
    const fetchMock = vi.fn(async (..._args: FetchArgs) =>
      new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ok = await probeAiModelCandidate({
      protocol: "openai",
      role: "chat",
      baseUrl: "https://gw.test/v1",
      apiKey: "sk-oai",
      modelId: "m1",
    });
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain("对话通道连通");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gw.test/v1/chat/completions");
    const openaiInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((openaiInit.headers as Record<string, string>).authorization).toBe("Bearer sk-oai");
    expect(JSON.parse(openaiInit.body as string)).toMatchObject({ max_tokens: 64 });

    vi.mocked(fetchMock).mockClear();
    fetchMock.mockImplementation(async (..._args: FetchArgs) =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "x" }] }), { status: 200 }),
    );
    const okAnthropic = await probeAiModelCandidate({
      protocol: "anthropic",
      role: "chat",
      baseUrl: "https://gw.test/anthropic",
      apiKey: "sk-ant",
      modelId: "m2",
    });
    expect(okAnthropic.ok).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://gw.test/anthropic/v1/messages");
    const antHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(antHeaders["x-api-key"]).toBe("sk-ant");
    expect(antHeaders["anthropic-version"]).toBe("2023-06-01");

    fetchMock.mockClear();
    fetchMock.mockImplementation(async (..._args: FetchArgs) =>
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    );
    const okEmbed = await probeAiModelCandidate({
      protocol: "openai",
      role: "embedding",
      baseUrl: "https://emb.test/v4",
      apiKey: "sk-emb",
      modelId: "e1",
    });
    expect(okEmbed.ok).toBe(true);
    expect(okEmbed.message).toContain("维度 3");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://emb.test/v4/embeddings");
  });

  it("思考模型兼容:thinking-only/content:null/message 信封判连通,HTTP 200 错误体摘录原因", async () => {
    type FetchArgs = [url: RequestInfo | URL, init?: RequestInit];
    // MiniMax-M3.1 实测形态:思考模型响应只有 thinking 块(HTTP 200)
    const fetchMock = vi.fn(async (..._args: FetchArgs) =>
      new Response(
        JSON.stringify({
          type: "message",
          role: "assistant",
          content: [{ type: "thinking", thinking: "…", signature: "sig" }],
          stop_reason: "max_tokens",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const thinkingOnly = await probeAiModelCandidate({
      protocol: "anthropic",
      role: "chat",
      baseUrl: "https://gw.test/anthropic",
      apiKey: "sk-ant",
      modelId: "MiniMax-M3.1-Flash",
    });
    expect(thinkingOnly.ok).toBe(true);
    expect(thinkingOnly.message).toContain("对话通道连通");
    // 探针预算给足:max_tokens=1 时思考模型全部预算被 thinking 吃掉(MiniMax 返回 content:null)
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(64);

    // content:null 但 message 信封完整 → 仍判连通(端点/鉴权/协议三方已证明)
    fetchMock.mockImplementation(async (..._args: FetchArgs) =>
      new Response(
        JSON.stringify({ type: "message", role: "assistant", content: null, stop_reason: "max_tokens" }),
        { status: 200 },
      ),
    );
    const nullContent = await probeAiModelCandidate({
      protocol: "anthropic",
      role: "chat",
      baseUrl: "https://gw.test/anthropic",
      apiKey: "sk-ant",
      modelId: "m",
    });
    expect(nullContent.ok).toBe(true);

    // HTTP 200 + 错误体 → 失败且原因可见(不再是笼统「响应结构不符合协议预期」)
    fetchMock.mockImplementation(async (..._args: FetchArgs) =>
      new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 200 }),
    );
    const errBody = await probeAiModelCandidate({
      protocol: "openai",
      role: "chat",
      baseUrl: "https://gw.test/v1",
      apiKey: "sk-oai",
      modelId: "m",
    });
    expect(errBody.ok).toBe(false);
    expect(errBody.message).toContain("通道报错:model not found");
  });

  it("通道不通不抛错,失败消息不含密钥", async () => {
    const result = await probeAiModelCandidate({
      protocol: "openai",
      role: "chat",
      baseUrl: "http://127.0.0.1:9",
      apiKey: KEY_A,
      modelId: "m",
    });
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain(KEY_A);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("已存条目测试:落 last_test_* + 审计(成败与延迟入 payload,密钥/端点不落)", async () => {
    const id = await makeModel({
      name: "已存测试",
      modelId: "m-test",
      roles: ["chat"],
      baseUrl: "http://127.0.0.1:9",
      apiKey: KEY_A,
    });
    const failResult = await testStoredAiModel(id, adminId);
    expect(failResult.ok).toBe(false);
    let row = await prisma.aiModel.findUniqueOrThrow({ where: { id } });
    expect(row.lastTestStatus).toBe("fail");
    expect(row.lastTestError).not.toContain(KEY_A);
    expect(row.lastTestedAt).not.toBeNull();

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const okResult = await testStoredAiModel(id, adminId);
    expect(okResult.ok).toBe(true);
    row = await prisma.aiModel.findUniqueOrThrow({ where: { id } });
    expect(row.lastTestStatus).toBe("ok");
    expect(row.lastTestError).toBeNull();
    expect(row.lastTestLatencyMs).toBe(okResult.latencyMs);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: adminId, action: AUDIT_ACTION.AI_MODEL_TESTED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({ id, ok: true });
    const auditJson = JSON.stringify(audit.payloadJson);
    expect(auditJson).not.toContain(KEY_A);
    expect(auditJson).not.toContain("127.0.0.1");
  });
});

describe("路由层契约", () => {
  it("admin:列表 200 / 新建 200 / 删除被引用 409 / 解绑后删除 200", async () => {
    const listRes = await modelsGet(await adminReq("/api/admin/ai-models", "GET"));
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { models: { id: number }[] };
    expect(listBody.models.map((m) => m.id)).toContain(chatAId);

    const createRes = await modelsPost(
      await adminReq("/api/admin/ai-models", "POST", {
        name: "路由新建",
        provider: "测试网关",
        protocol: "openai",
        modelId: "m-route",
        roles: ["chat"],
        apiKey: KEY_A,
      }),
    );
    expect(createRes.status).toBe(200);
    const created = ((await createRes.json()) as { model: { id: number } }).model;
    createdIds.push(created.id);

    await updateRoleBinding({ role: "chat", primaryId: created.id, backupId: null, dailyTokenMax: 20 }, adminId);
    const delRes = await modelDelete(await adminReq(`/api/admin/ai-models/${created.id}`, "DELETE"), {
      params: { id: String(created.id) },
    });
    expect(delRes.status).toBe(409);
    expect((await errorBody(delRes)).code).toBe("BINDING_REFERENCED");

    await updateRoleBinding({ role: "chat", primaryId: null, backupId: null, dailyTokenMax: 20 }, adminId);
    const delRes2 = await modelDelete(await adminReq(`/api/admin/ai-models/${created.id}`, "DELETE"), {
      params: { id: String(created.id) },
    });
    expect(delRes2.status).toBe(200);
  });

  it("绑定路由:GET 两角色;非法绑定 422 带分支码;合法 200", async () => {
    const getRes = await bindingsGet(await adminReq("/api/admin/ai-models/bindings", "GET"));
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { bindings: { role: string }[] };
    expect(body.bindings.map((b) => b.role)).toEqual(["chat", "embedding"]);

    const chatId = chatAId;
    const sameRes = await bindingsPut(
      await adminReq("/api/admin/ai-models/bindings", "PUT", {
        role: "chat",
        primaryId: chatId,
        backupId: chatId,
        dailyTokenMax: 20,
      }),
    );
    expect(sameRes.status).toBe(422);
    expect((await errorBody(sameRes)).code).toBe("SAME_MODEL");

    const okRes = await bindingsPut(
      await adminReq("/api/admin/ai-models/bindings", "PUT", {
        role: "chat",
        primaryId: chatId,
        backupId: null,
        dailyTokenMax: 25,
      }),
    );
    expect(okRes.status).toBe(200);
  });

  it("普通用户 403;未登录 401;非法载荷 422", async () => {
    const forbidden = await modelsGet(
      await adminReq("/api/admin/ai-models", "GET", undefined, { id: userId, role: "user" }),
    );
    expect(forbidden.status).toBe(403);

    const anonymous = new NextRequest("http://localhost/api/admin/ai-models", { method: "GET" });
    expect((await modelsGet(anonymous)).status).toBe(401);

    const badPayload = await modelsPost(
      await adminReq("/api/admin/ai-models", "POST", {
        name: "x",
        provider: "x",
        protocol: "grpc",
        modelId: "m",
        roles: ["chat"],
      }),
    );
    expect(badPayload.status).toBe(422);
  });
});
