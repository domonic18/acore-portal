"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckChip } from "@/components/ui/check-chip";
import { Input} from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorMessage, requestJson } from "@/lib/api-client";
import type { AiModelAdminView, AiModelProbeResult } from "@/lib/ai-models-types";
import {
  AI_MODEL_ROLE_LABELS,
  AI_MODEL_ROLES,
  AI_PROTOCOLS,
  AI_PROTOCOL_LABELS,
  AI_PROVIDER_PRESETS,
  AI_TIMEOUT_SEC_MAX,
  AI_TIMEOUT_SEC_MIN,
  type AiModelRole,
  type AiProtocol,
} from "@/constants/ai-models";

const OTHER_PROVIDER = "__other__";

/** 新增/编辑展开表单(规则 27:新增自动展开,字段带可见标签) */
export function ModelForm({
  model,
  onDone,
}: {
  /** undefined = 新增 */
  model?: AiModelAdminView;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(model?.name ?? "");
  const [roles, setRoles] = useState<AiModelRole[]>(model?.roles ?? ["chat"]);
  const [provider, setProvider] = useState(model?.provider ?? "");
  const [providerKey, setProviderKey] = useState(
    model ? (AI_PROVIDER_PRESETS.some((p) => p.name === model.provider) ? model.provider : OTHER_PROVIDER) : "",
  );
  const [protocol, setProtocol] = useState<AiProtocol>(model?.protocol ?? "openai");
  const [modelId, setModelId] = useState(model?.modelId ?? "");
  const [baseUrl, setBaseUrl] = useState(model?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [timeoutSec, setTimeoutSec] = useState(String(model?.timeoutSec ?? 120));
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [probe, setProbe] = useState<AiModelProbeResult | null>(null);

  const embeddingOnly = roles.length === 1 && roles[0] === "embedding";
  const primaryRole: AiModelRole = roles.includes("embedding") ? "embedding" : "chat";

  const toggleRole = (role: AiModelRole, next: boolean) => {
    setRoles((prev) => {
      const nextRoles = next ? [...prev, role] : prev.filter((r) => r !== role);
      if (nextRoles.length === 0) return prev; // 至少一项
      // 只勾向量:协议锁 openai(anthropic 无 embedding 端点)
      if (nextRoles.length === 1 && nextRoles[0] === "embedding") setProtocol("openai");
      return nextRoles;
    });
  };

  const pickProvider = (key: string) => {
    setProviderKey(key);
    if (key === OTHER_PROVIDER) return;
    const preset = AI_PROVIDER_PRESETS.find((p) => p.name === key);
    if (!preset) return;
    setProvider(preset.name);
    // 预设默认 openai 协议(切协议走 pickProtocol 换建议地址);向量用途锁 openai
    setProtocol("openai");
    setBaseUrl(preset.baseUrl);
  };

  const pickProtocol = (next: AiProtocol) => {
    setProtocol(next);
    // 切协议时按预设换建议 Base URL(用户可再改)
    const preset = AI_PROVIDER_PRESETS.find((p) => p.name === providerKey);
    if (preset) setBaseUrl(next === "anthropic" ? preset.anthropicBaseUrl ?? "" : preset.baseUrl);
  };

  const run = async (fn: () => Promise<void>, which: (v: boolean) => void) => {
    setError("");
    setNotice("");
    setProbe(null);
    which(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      which(false);
    }
  };

  const payload = () => ({
    name,
    provider: provider || providerKey || "其他",
    protocol: embeddingOnly ? ("openai" as const) : protocol,
    modelId,
    baseUrl: baseUrl.trim(),
    apiKey: apiKey.trim(),
    roles,
    timeoutSec: Number.parseInt(timeoutSec, 10) || 120,
  });

  const testConnection = () =>
    run(async () => {
      const body = payload();
      if (!body.apiKey && model?.apiKeyConfigured) {
        // 编辑态密钥留空:候选值探针没有已存密钥可用,引导走行内「测试」
        setProbe({ ok: false, message: "密钥留空(保留现值):如需验证已存密钥,请用列表行「测试」。", latencyMs: 0 });
        return;
      }
      const res = await requestJson<{ result: AiModelProbeResult }>("/api/admin/ai-models/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, role: primaryRole }),
      });
      setProbe(res.result);
    }, setTesting);

  const save = () =>
    run(async () => {
      const body = payload();
      if (model) {
        await requestJson(`/api/admin/ai-models/${model.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await requestJson("/api/admin/ai-models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setNotice("已保存");
      router.refresh();
      onDone();
    }, setBusy);

  return (
    <div className="rounded-lg border border-[#22385a] bg-[#13233a]/60 p-4" data-testid={model ? `ai-model-form-${model.id}` : "ai-model-form-new"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="名称">
          <Input value={name} maxLength={100} aria-label="名称" onChange={(e) => setName(e.target.value)} placeholder="如:MiniMax 对话" />
        </Field>
        <Field label="用途(至少一项)">
          <div className="flex gap-2">
            {AI_MODEL_ROLES.map((r) => (
              <CheckChip key={r} checked={roles.includes(r)} onChange={(next) => toggleRole(r, next)}>
                {AI_MODEL_ROLE_LABELS[r]}
              </CheckChip>
            ))}
          </div>
        </Field>
        <Field label="供应商">
          <Select aria-label="供应商" value={providerKey} onChange={(e) => pickProvider(e.target.value)}>
            <option value="">选择供应商预设…</option>
            {AI_PROVIDER_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value={OTHER_PROVIDER}>其他(自由填写)</option>
          </Select>
          {providerKey === OTHER_PROVIDER && (
            <Input
              className="mt-1"
              value={provider}
              maxLength={50}
              aria-label="供应商名称"
              placeholder="供应商名称"
              onChange={(e) => setProvider(e.target.value)}
            />
          )}
        </Field>
        <Field label="协议">
          <Select
            aria-label="协议"
            value={protocol}
            disabled={embeddingOnly}
            onChange={(e) => pickProtocol(e.target.value as AiProtocol)}
          >
            {AI_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {AI_PROTOCOL_LABELS[p]}
              </option>
            ))}
          </Select>
          {embeddingOnly && (
            <p className="mt-1 text-[11.5px] text-[#6482a3]">向量用途只支持 openai 兼容协议。</p>
          )}
        </Field>
        <Field label="模型 ID">
          <Input
            value={modelId}
            maxLength={100}
            aria-label="模型 ID"
            onChange={(e) => setModelId(e.target.value)}
            placeholder={AI_PROVIDER_PRESETS.find((p) => p.name === providerKey)?.exampleModelId ?? "如:gpt-4o-mini"}
          />
        </Field>
        <Field label="Base URL(留空 = 供应商默认端点)">
          <Input
            value={baseUrl}
            maxLength={500}
            aria-label="Base URL"
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1(粘贴完整端点会自动剥尾缀)"
          />
        </Field>
        <Field label={model?.apiKeyConfigured ? "API Key(留空 = 保留已配置的密钥)" : "API Key"}>
          <Input
            type="password"
            value={apiKey}
            maxLength={500}
            aria-label="API Key"
            autoComplete="new-password"
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={model?.apiKeyConfigured ? "已配置,输入新值可覆盖" : "sk-…"}
          />
        </Field>
        <Field label={`超时秒(${AI_TIMEOUT_SEC_MIN}–${AI_TIMEOUT_SEC_MAX})`}>
          <Input
            type="number"
            min={AI_TIMEOUT_SEC_MIN}
            max={AI_TIMEOUT_SEC_MAX}
            value={timeoutSec}
            aria-label="超时秒"
            onChange={(e) => setTimeoutSec(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={testing || busy} onClick={testConnection}>
          {testing ? "测试中…" : "测试连接"}
        </Button>
        <Button type="button" size="sm" disabled={busy || testing} onClick={save} data-testid="ai-model-save">
          {busy ? "保存中…" : "保存"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDone}>
          收起
        </Button>
        {probe && (
          <span role="status" className={`text-[12px] ${probe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}>
            {probe.message}
            {probe.latencyMs > 0 && `(${probe.latencyMs}ms)`}
          </span>
        )}
        {notice && <span className="text-[12px] text-[#6ee7b7]">{notice}</span>}
        {error && (
          <span role="alert" className="text-[12px] text-[#eda9a9]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11.5px] text-[#6482a3]">{label}</span>
      {children}
    </label>
  );
}
