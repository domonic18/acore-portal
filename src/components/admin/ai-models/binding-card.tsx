"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import type { RoleBindingView } from "@/lib/ai-models-types";
import {
  AI_MODEL_ROLE_HINTS,
  AI_MODEL_ROLE_LABELS,
  type AiModelRole,
} from "@/constants/ai-models";
import type { AiModelAdminView } from "@/lib/ai-models-types";

/** 角色绑定卡(置顶区,前台实际生效状态):主力/备用下拉 + 日配额(仅对话卡) */
export function RoleBindingCard({
  binding,
  models,
}: {
  binding: RoleBindingView;
  models: AiModelAdminView[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [primaryId, setPrimaryId] = useState<number | null>(binding.primaryId);
  const [backupId, setBackupId] = useState<number | null>(binding.backupId);
  const [dailyMax, setDailyMax] = useState(String(binding.dailyMax));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const candidates = models.filter((m) => m.enabled && m.roles.includes(binding.role));
  const isChat = binding.role === "chat";

  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/admin/ai-models/bindings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: binding.role,
          primaryId,
          backupId,
          dailyMax: Number.parseInt(dailyMax, 10) || 0,
        }),
      });
      setNotice("已保存");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unbound = primaryId === null && backupId === null;

  return (
    <div
      data-testid={`ai-binding-card-${binding.role}`}
      className="rounded-xl border border-[#22385a] bg-[#0b1526] p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#dcebf7]">
          {AI_MODEL_ROLE_LABELS[binding.role]}
        </h2>
        <span className="text-[11.5px] text-[#6482a3]">{AI_MODEL_ROLE_HINTS[binding.role]}</span>
      </div>

      {unbound && (
        <p role="status" className="mt-2 rounded-md border border-[#e8c877]/30 bg-[#e8c877]/10 px-3 py-1.5 text-[12.5px] text-[#e8c877]">
          未绑定模型:对应功能处于关闭/降级状态(前台 /search 为关键词降级态)。
        </p>
      )}

      <div className={`grid gap-3 ${isChat ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <ModelSelect
          label="主力"
          value={primaryId}
          candidates={candidates}
          disabledId={backupId}
          disabled={!hydrated}
          onChange={setPrimaryId}
        />
        <ModelSelect
          label="备用"
          value={backupId}
          candidates={candidates}
          disabledId={primaryId}
          disabled={!hydrated}
          onChange={setBackupId}
        />
        {isChat && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11.5px] text-[#6482a3]">每用户日配额(0 = 不限额)</span>
            <Input
              type="number"
              min={0}
              max={10000}
              value={dailyMax}
              aria-label="每用户日配额"
              onChange={(e) => setDailyMax(e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" size="sm" disabled={busy} onClick={save} data-testid={`ai-binding-save-${binding.role}`}>
          {busy ? "保存中…" : "保存绑定"}
        </Button>
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

function ModelSelect({
  label,
  value,
  candidates,
  disabledId,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  candidates: AiModelAdminView[];
  disabledId: number | null;
  disabled?: boolean;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11.5px] text-[#6482a3]">{label}(主力优先;停用主力自动落备用)</span>
      <Select
        aria-label={`${label}模型`}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">未绑定</option>
        {candidates.map((m) => (
          <option key={m.id} value={m.id} disabled={m.id === disabledId}>
            {m.modelId}({m.provider})
          </option>
        ))}
      </Select>
    </label>
  );
}
