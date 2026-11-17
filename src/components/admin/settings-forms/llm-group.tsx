"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

/**
 * AI 模型通道(M8/M9):对话与向量各一套端点,协议可选 openai / anthropic。
 * 两把密钥只写不读(留空=保持现值);测试连接走未保存的候选值,
 * 不落库即可验证「地址+密钥+模型」三件是否真的通。
 */
export function LlmGroup({ view }: { view: SettingsView["llm"] }) {
  const [provider, setProvider] = useState(view.provider);
  const [baseUrl, setBaseUrl] = useState(view.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(view.model);
  const [dailyQuota, setDailyQuota] = useState(String(view.dailyQuota));
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState(view.embeddingBaseUrl);
  const [embeddingModel, setEmbeddingModel] = useState(view.embeddingModel);
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  const [chatBusy, setChatBusy] = useState(false);
  const [chatProbe, setChatProbe] = useState<{ ok: boolean; text: string } | null>(null);
  const [embedBusy, setEmbedBusy] = useState(false);
  const [embedProbe, setEmbedProbe] = useState<{ ok: boolean; text: string } | null>(null);

  async function testChannel(target: "chat" | "embedding") {
    const setBusy = target === "chat" ? setChatBusy : setEmbedBusy;
    const setProbe = target === "chat" ? setChatProbe : setEmbedProbe;
    setBusy(true);
    setProbe(null);
    try {
      const body = await requestJson<{ ok?: boolean; message?: string }>(
        "/api/admin/settings/test/llm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target,
            provider,
            baseUrl,
            apiKey,
            model,
            embeddingBaseUrl,
            embeddingModel,
            embeddingApiKey,
          }),
        },
      );
      setProbe({
        ok: !!body.ok,
        text: body.message ?? (body.ok ? "连通" : "连接失败"),
      });
    } catch (err) {
      setProbe({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GroupSection
      name="llm"
      title="AI 模型通道"
      description="站内问答与语义检索的模型端点;地址含 /v1 前缀;密钥留空=保持现值;未配置时前台自动降级为关键词检索"
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="w-56 shrink-0 text-[#93b2ce]">协议</span>
        <div className="flex gap-2">
          {(
            [
              { id: "openai", label: "OpenAI 兼容" },
              { id: "anthropic", label: "Anthropic(Claude)" },
            ] as const
          ).map((opt) => (
            <Button
              key={opt.id}
              type="button"
              variant={provider === opt.id ? "primary" : "secondary"}
              aria-pressed={provider === opt.id}
              data-testid={`settings-field-llm-provider-${opt.id}`}
              onClick={() => setProvider(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <TextRow
        label="对话端点地址"
        testid="settings-field-llm-baseUrl"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://gw.example.com/v1"
      />
      <TextRow
        label="对话模型"
        testid="settings-field-llm-model"
        value={model}
        onChange={setModel}
        placeholder="claude-sonnet-4-5"
      />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">对话密钥</span>
        <SecretInput
          testid="settings-field-llm-apiKey"
          configured={view.apiKeyConfigured}
          value={apiKey}
          onChange={setApiKey}
        />
      </label>
      <TextRow
        label="向量端点地址"
        testid="settings-field-llm-embeddingBaseUrl"
        value={embeddingBaseUrl}
        onChange={setEmbeddingBaseUrl}
        placeholder="https://gw.example.com/v1"
      />
      <TextRow
        label="向量模型"
        testid="settings-field-llm-embeddingModel"
        value={embeddingModel}
        onChange={setEmbeddingModel}
        placeholder="bge-m3"
      />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">向量密钥</span>
        <SecretInput
          testid="settings-field-llm-embeddingApiKey"
          configured={view.embeddingApiKeyConfigured}
          value={embeddingApiKey}
          onChange={setEmbeddingApiKey}
        />
      </label>
      <TextRow
        label="每日问答配额"
        testid="settings-field-llm-dailyQuota"
        value={dailyQuota}
        onChange={setDailyQuota}
        type="number"
        placeholder="20"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="settings-test-llm-chat-run"
          type="button"
          variant="secondary"
          disabled={chatBusy}
          onClick={() => {
            void testChannel("chat");
          }}
        >
          {chatBusy ? "测试中…" : "测试对话通道"}
        </Button>
        {chatProbe ? (
          <span
            data-testid="settings-test-llm-chat-result"
            className={`text-sm ${chatProbe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {chatProbe.text}
          </span>
        ) : null}
        <Button
          data-testid="settings-test-llm-embedding-run"
          type="button"
          variant="secondary"
          disabled={embedBusy}
          onClick={() => {
            void testChannel("embedding");
          }}
        >
          {embedBusy ? "测试中…" : "测试向量通道"}
        </Button>
        {embedProbe ? (
          <span
            data-testid="settings-test-llm-embedding-result"
            className={`text-sm ${embedProbe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {embedProbe.text}
          </span>
        ) : null}
      </div>
      <SaveBar
        group="llm"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          const ok = await save("llm", {
            provider,
            baseUrl,
            apiKey,
            model,
            dailyQuota: dailyQuota === "" ? undefined : Number(dailyQuota),
            embeddingBaseUrl,
            embeddingModel,
            embeddingApiKey,
          });
          if (ok) {
            setApiKey("");
            setEmbeddingApiKey("");
          }
        }}
      />
    </GroupSection>
  );
}
