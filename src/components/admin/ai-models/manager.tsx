"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ModelForm } from "@/components/admin/ai-models/model-form";
import { RoleBindingCard } from "@/components/admin/ai-models/binding-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { errorMessage, requestJson } from "@/lib/api-client";
import type { AiModelAdminView, AiModelProbeResult, RoleBindingView } from "@/lib/ai-models-types";
import {
  AI_MODEL_ROLE_LABELS,
  AI_MODEL_ROLES,
  AI_PROTOCOL_LABELS,
  type AiModelRole,
} from "@/constants/ai-models";

/**
 * AI 模型管理台(规则 27 口径):角色绑定卡置顶(实际生效状态),
 * 模型条目表折叠行 + 展开编辑,新增自动展开;写操作后 router.refresh()。
 */
export function AiModelsManager({
  models,
  bindings,
}: {
  models: AiModelAdminView[];
  bindings: RoleBindingView[];
}) {
  const [expanded, setExpanded] = useState<number | "new" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-[#dcebf7]">角色绑定</h2>
        <p className="text-[12.5px] text-[#6482a3]">
          每个用途绑主力 + 备用:主力停用时自动改走备用(静态选边,不是调用失败重试);改完即刻生效。
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {bindings.map((b) => (
            <RoleBindingCard key={b.role} binding={b} models={models} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[#dcebf7]">模型条目</h2>
          <Button
            type="button"
            size="sm"
            data-testid="ai-model-create"
            disabled={expanded === "new"}
            onClick={() => setExpanded("new")}
          >
            新增条目
          </Button>
        </div>

        {expanded === "new" && (
          <ModelForm onDone={() => setExpanded(null)} />
        )}

        {models.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#22385a] px-4 py-8 text-center text-[13px] text-[#6482a3]">
            还没有模型条目:点「新增条目」登记第一个模型(密钥可以留空后补)。
          </p>
        ) : (
          <Table minWidth="min-w-[880px]">
            <THead>
              <Tr>
                <Th>名称</Th>
                <Th>供应商</Th>
                <Th>协议</Th>
                <Th>模型 ID</Th>
                <Th>用途</Th>
                <Th>API Key</Th>
                <Th>当前定位</Th>
                <Th>最近测试</Th>
                <Th>操作</Th>
              </Tr>
            </THead>
            <tbody>
              {models.map((m) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  expanded={expanded === m.id}
                  onExpand={(open) => setExpanded(open ? m.id : null)}
                />
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

function ModelRow({
  model,
  expanded,
  onExpand,
}: {
  model: AiModelAdminView;
  expanded: boolean;
  onExpand: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState<AiModelProbeResult | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = (enabled: boolean) =>
    run(async () => {
      await requestJson(`/api/admin/ai-models/${model.id}/status`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      router.refresh();
    });

  const test = () =>
    run(async () => {
      setTesting(true);
      try {
        const res = await requestJson<{ result: AiModelProbeResult }>(
          `/api/admin/ai-models/${model.id}/test`,
          { method: "POST" },
        );
        setProbe(res.result);
        router.refresh();
      } finally {
        setTesting(false);
      }
    });

  const remove = () =>
    run(async () => {
      await requestJson(`/api/admin/ai-models/${model.id}`, { method: "DELETE" });
      router.refresh();
    });

  return (
    <>
      <Tr data-testid={`ai-model-row-${model.id}`}>
        <Td className="whitespace-nowrap font-medium">{model.name}</Td>
        <Td className="whitespace-nowrap">{model.provider}</Td>
        <Td className="whitespace-nowrap">{AI_PROTOCOL_LABELS[model.protocol]}</Td>
        <Td className="whitespace-nowrap">{model.modelId}</Td>
        <Td>
          <div className="flex flex-wrap gap-1">
            {model.roles.map((r) => (
              <Badge key={r} tone="accent">
                {AI_MODEL_ROLE_LABELS[r]}
              </Badge>
            ))}
          </div>
        </Td>
        <Td className="whitespace-nowrap">
          {model.apiKeyConfigured ? (
            <Badge tone="ok">已配置</Badge>
          ) : (
            <Badge tone="muted">无鉴权</Badge>
          )}
        </Td>
        <Td>
          {model.bindingRoles.length === 0 ? (
            <span className="text-[#6482a3]">未入绑定</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {model.bindingRoles.map((b) => (
                <Badge key={`${b.role}-${b.position}`} tone={b.position === "primary" ? "accent" : "muted"}>
                  {AI_MODEL_ROLE_LABELS[b.role]}
                  {b.position === "primary" ? "·主力" : "·备用"}
                </Badge>
              ))}
            </div>
          )}
        </Td>
        <Td>
          <TestBadge model={model} probe={probe} testing={testing} />
        </Td>
        <Td>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Switch
                checked={model.enabled}
                disabled={busy}
                ariaLabel={`启用「${model.name}」`}
                onChange={toggleEnabled}
              />
              <Button type="button" size="sm" variant="ghost" disabled={busy || testing} onClick={test}>
                {testing ? "测试中…" : "测试"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onExpand(!expanded)}>
                {expanded ? "收起" : "编辑"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={remove}
                aria-label={`删除「${model.name}」`}
              >
                删除
              </Button>
            </div>
            {error ? (
              <span role="alert" className="max-w-[190px] whitespace-normal text-[11.5px] text-[#eda9a9]">
                {error}
              </span>
            ) : null}
          </div>
        </Td>
      </Tr>
      {expanded && (
        <Tr className="bg-[#0b1526]/60">
          <Td colSpan={9}>
            <ModelForm model={model} onDone={() => onExpand(false)} />
          </Td>
        </Tr>
      )}
    </>
  );
}

function TestBadge({
  model,
  probe,
  testing,
}: {
  model: AiModelAdminView;
  probe: AiModelProbeResult | null;
  testing: boolean;
}) {
  if (testing) return <span className="text-[#6482a3]">测试中…</span>;
  const status = probe?.ok ?? model.lastTest?.status === "ok";
  const failed = probe ? !probe.ok : model.lastTest?.status === "fail";
  if (!model.lastTest && !probe) return <span className="text-[#6482a3]">未测试</span>;
  if (status && !failed) {
    return (
      <Badge tone="ok">
        通过{probe?.latencyMs ? ` ${probe.latencyMs}ms` : model.lastTest?.latencyMs ? ` ${model.lastTest.latencyMs}ms` : ""}
      </Badge>
    );
  }
  const message = probe?.message ?? model.lastTest?.error ?? "失败";
  return (
    <div className="flex max-w-[240px] flex-col gap-1">
      <div>
        <Badge tone="danger">失败</Badge>
      </div>
      <span role="alert" className="whitespace-normal text-[11.5px] leading-snug text-[#eda9a9]">
        {message}
      </span>
    </div>
  );
}
