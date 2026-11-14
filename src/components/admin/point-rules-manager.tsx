"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";
import { POINT_RULE_AMOUNT_MAX } from "@/constants/points";

export type PointRuleItem = {
  event: string;
  label: string;
  amount: number;
  enabled: boolean;
  remark: string | null;
  configured: boolean;
};

type Draft = { amount: string; enabled: boolean };

function toDrafts(rules: PointRuleItem[]): Record<string, Draft> {
  return Object.fromEntries(
    rules.map((r) => [r.event, { amount: String(r.amount), enabled: r.enabled }]),
  );
}

/** 分值只收 0-上限的整数;非法返回 null(保存前拦,不给服务端发脏值) */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= POINT_RULE_AMOUNT_MAX ? value : null;
}

/**
 * 后台积分规则管控(/admin/point-rules):获取类事件的分值与开关。
 * 整页只有一个「保存」按钮(保存态文案用非按钮元素承载),未保存提示 + 刷新拦截。
 */
export function PointRulesManager({ rules }: { rules: PointRuleItem[] }) {
  const [baseline, setBaseline] = useState<PointRuleItem[]>(rules);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => toDrafts(rules));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(() => {
    for (const rule of baseline) {
      const draft = drafts[rule.event];
      if (!draft) return true;
      const amount = parseAmount(draft.amount);
      if (amount === null || amount !== rule.amount) return true;
      if (draft.enabled !== rule.enabled) return true;
    }
    return false;
  }, [baseline, drafts]);

  // 未保存守卫:仅能拦刷新/关闭标签页(App Router 无路由级拦截,站内跳转靠提示条)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function update(event: string, patch: Partial<Draft>) {
    setSaved(false);
    setDrafts((prev) => ({
      ...prev,
      [event]: { ...(prev[event] ?? { amount: "0", enabled: false }), ...patch },
    }));
  }

  async function save() {
    if (busy) return;
    const changes: { event: string; amount: number; enabled: boolean }[] = [];
    for (const rule of baseline) {
      const draft = drafts[rule.event];
      const amount = draft ? parseAmount(draft.amount) : null;
      if (!draft || amount === null) {
        setError(`「${rule.label}」的分值须是 0-${POINT_RULE_AMOUNT_MAX} 的整数。`);
        return;
      }
      changes.push({ event: rule.event, amount, enabled: draft.enabled });
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body = await requestJson<{ changed: string[]; rules: PointRuleItem[] }>(
        "/api/admin/point-rules",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rules: changes }),
        },
      );
      setBaseline(body.rules);
      setDrafts(toDrafts(body.rules));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {dirty && (
        <p className="rounded-lg border border-[#e8c877]/40 bg-[#e8c877]/10 px-3 py-2 text-[13px] text-[#e8c877]">
          有未保存的修改:未保存前刷新页面会丢失本次改动。
        </p>
      )}

      <div className="flex flex-col gap-3">
        {baseline.map((rule) => {
          const draft = drafts[rule.event] ?? { amount: "0", enabled: false };
          const amountInvalid = parseAmount(draft.amount) === null;
          return (
            <div
              key={rule.event}
              className="rounded-xl border border-[#22385a] bg-[#0b1526] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#dcebf7]">{rule.label}</p>
                <span className="font-mono text-[11px] text-[#6482a3]">{rule.event}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-[13px]">
                  <span className="text-[#93b2ce]">分值</span>
                  <Input
                    type="number"
                    min={0}
                    max={POINT_RULE_AMOUNT_MAX}
                    step={1}
                    value={draft.amount}
                    aria-label={`${rule.label}分值`}
                    aria-invalid={amountInvalid}
                    onChange={(e) => update(rule.event, { amount: e.target.value })}
                    className="w-28"
                  />
                </label>

                <label className="flex items-center gap-2 text-[13px] text-[#93b2ce]">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    aria-label={`${rule.label}启用`}
                    onChange={(e) => update(rule.event, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#6fb7e0]"
                  />
                  <span>启用</span>
                </label>
              </div>

              {amountInvalid && (
                <p role="alert" className="mt-2 text-[12px] text-[#eda9a9]">
                  分值须是 0-{POINT_RULE_AMOUNT_MAX} 的整数。
                </p>
              )}

              <p className="mt-3 text-[12px] text-[#6482a3]">
                {rule.configured
                  ? `${rule.remark ?? "—"};停用后该事件不再发放积分。`
                  : "规则行缺失(历史环境未补种),保存后自动补种。"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "保存中…" : "保存规则"}
        </Button>
        {saved && !dirty && (
          <span className="text-[13px] text-[#6ee7b7]">已保存,新的发放即刻按新规则执行。</span>
        )}
        {!dirty && !saved && (
          <span className="text-[13px] text-[#6482a3]">当前配置已是最新。</span>
        )}
        {error && (
          <span role="alert" className="text-[13px] text-[#eda9a9]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
