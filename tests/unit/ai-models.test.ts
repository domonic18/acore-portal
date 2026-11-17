import { describe, expect, it } from "vitest";

import {
  AI_MODEL_ROLES,
  AI_PROVIDER_PRESETS,
  AI_ROLE_PROTOCOL_CONSTRAINT,
} from "@/constants/ai-models";
import { normalizeBaseUrl, parseRoles } from "@/server/services/shared/ai-models/crud";
import { validateBindingSelection } from "@/server/services/shared/ai-models/bindings";
import { pickBoundModel } from "@/server/services/shared/ai-models/resolver";

/**
 * AI 模型注册表纯函数单测:normalizeBaseUrl 剥尾缀决策表 /
 * validateBindingSelection 绑定三元组校验 / pickBoundModel 静态选边 /
 * 供应商预设常量形状(端点为 https 且可拼协议路径)。
 */

describe("normalizeBaseUrl", () => {
  it("剥 openai 端点尾缀(/chat/completions)", () => {
    expect(normalizeBaseUrl("https://api.minimaxi.com/v1/chat/completions")).toBe(
      "https://api.minimaxi.com/v1",
    );
  });

  it("剥 anthropic 端点尾缀(/v1/messages)", () => {
    expect(normalizeBaseUrl("https://api.minimaxi.com/anthropic/v1/messages")).toBe(
      "https://api.minimaxi.com/anthropic",
    );
  });

  it("剥 embedding 端点尾缀(/embeddings)", () => {
    expect(normalizeBaseUrl("https://open.bigmodel.cn/api/paas/v4/embeddings")).toBe(
      "https://open.bigmodel.cn/api/paas/v4",
    );
  });

  it("trim + 去尾斜杠;裸 base 原样保留", () => {
    expect(normalizeBaseUrl("  https://gw.example.com/v1/  ")).toBe("https://gw.example.com/v1");
    expect(normalizeBaseUrl("https://gw.example.com/v1")).toBe("https://gw.example.com/v1");
    expect(normalizeBaseUrl("")).toBe("");
  });

  it("同尾缀只剥一次(剥完已是 base 不再误剥)", () => {
    expect(normalizeBaseUrl("https://gw.example.com/chat/completions")).toBe(
      "https://gw.example.com",
    );
  });
});

describe("validateBindingSelection", () => {
  const models = [
    { id: 1, enabled: true, roles: ["chat"], protocol: "openai" },
    { id: 2, enabled: true, roles: ["embedding"], protocol: "openai" },
    { id: 3, enabled: false, roles: ["chat", "embedding"], protocol: "anthropic" },
  ];

  it("双空 = 解绑该角色,合法", () => {
    expect(validateBindingSelection({ role: "chat", primaryId: null, backupId: null }, models)).toEqual({ ok: true });
  });

  it("主力 = 备用 → SAME_MODEL", () => {
    const v = validateBindingSelection({ role: "chat", primaryId: 1, backupId: 1 }, models);
    expect(v).toMatchObject({ ok: false, code: "SAME_MODEL" });
  });

  it("引用不存在的条目 → MODEL_NOT_FOUND", () => {
    const v = validateBindingSelection({ role: "chat", primaryId: 99, backupId: null }, models);
    expect(v).toMatchObject({ ok: false, code: "MODEL_NOT_FOUND" });
  });

  it("绑停用条目 → MODEL_DISABLED", () => {
    const v = validateBindingSelection({ role: "chat", primaryId: 3, backupId: null }, models);
    expect(v).toMatchObject({ ok: false, code: "MODEL_DISABLED" });
  });

  it("条目不承担该角色 → ROLE_MISMATCH", () => {
    const v = validateBindingSelection({ role: "embedding", primaryId: 1, backupId: null }, models);
    expect(v).toMatchObject({ ok: false, code: "ROLE_MISMATCH" });
  });

  it("embedding 绑 anthropic 条目 → PROTOCOL_MISMATCH", () => {
    const anthropicEmbed = [{ id: 4, enabled: true, roles: ["embedding"], protocol: "anthropic" }];
    const v = validateBindingSelection({ role: "embedding", primaryId: 4, backupId: null }, anthropicEmbed);
    expect(v).toMatchObject({ ok: false, code: "PROTOCOL_MISMATCH" });
  });

  it("合法绑定(chat 双条目,跨协议)通过", () => {
    const enabled3 = models.map((m) => (m.id === 3 ? { ...m, enabled: true } : m));
    expect(validateBindingSelection({ role: "chat", primaryId: 1, backupId: 3 }, enabled3)).toEqual({
      ok: true,
    });
  });
});

describe("pickBoundModel(静态选边)", () => {
  const on = { enabled: true };
  const off = { enabled: false };

  it("主力启用 → primary(不看备用)", () => {
    expect(pickBoundModel(on, off)).toBe("primary");
    expect(pickBoundModel(on, on)).toBe("primary");
  });

  it("主力停用 + 备用启用 → backup", () => {
    expect(pickBoundModel(off, on)).toBe("backup");
    expect(pickBoundModel(null, on)).toBe("backup");
  });

  it("双停用/双缺失 → null(降级)", () => {
    expect(pickBoundModel(off, off)).toBeNull();
    expect(pickBoundModel(null, null)).toBeNull();
    expect(pickBoundModel(on, null)).toBe("primary");
  });
});

describe("供应商预设与角色协议约束", () => {
  it("三家预设:baseUrl 为 https,exampleModelId 非空", () => {
    expect(AI_PROVIDER_PRESETS.map((p) => p.name)).toEqual([
      "MiniMax(国内版)",
      "小米 MiMo",
      "智谱 AI",
    ]);
    for (const p of AI_PROVIDER_PRESETS) {
      expect(p.baseUrl.startsWith("https://")).toBe(true);
      expect(p.exampleModelId.length).toBeGreaterThan(0);
    }
  });

  it("MiniMax/MiMo 有 anthropic 端点,智谱无", () => {
    const minimax = AI_PROVIDER_PRESETS.find((p) => p.name.includes("MiniMax"))!;
    const mimo = AI_PROVIDER_PRESETS.find((p) => p.name.includes("小米"))!;
    const zhipu = AI_PROVIDER_PRESETS.find((p) => p.name.includes("智谱"))!;
    expect(minimax.anthropicBaseUrl).toMatch(/^https:\/\/.+\/anthropic$/);
    expect(mimo.anthropicBaseUrl).toMatch(/^https:\/\/.+\/anthropic$/);
    expect(zhipu.anthropicBaseUrl).toBeNull();
  });

  it("embedding 角色只允许 openai 协议;chat 双协议", () => {
    expect(AI_ROLE_PROTOCOL_CONSTRAINT.embedding).toEqual(["openai"]);
    expect(AI_ROLE_PROTOCOL_CONSTRAINT.chat).toContain("anthropic");
    expect(AI_MODEL_ROLES).toEqual(["chat", "embedding"]);
  });
});

describe("parseRoles(roles Json 安全解析)", () => {
  it("合法数组过滤非法值;空/非数组抛 ROLES_CORRUPTED", () => {
    expect(parseRoles(["chat", "bogus", "embedding"])).toEqual(["chat", "embedding"]);
    expect(() => parseRoles([])).toThrow();
    expect(() => parseRoles("chat")).toThrow();
    expect(() => parseRoles(["bogus"])).toThrow();
  });
});
