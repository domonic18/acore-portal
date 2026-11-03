"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage, requestJson } from "@/lib/api-client";

export type GroupName =
  | "smtp"
  | "turnstile"
  | "security"
  | "notify"
  | "site"
  | "appearance"
  | "umami";

export function SecretInput({
  testid,
  configured,
  value,
  onChange,
}: {
  testid: string;
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      data-testid={testid}
      type="password"
      autoComplete="new-password"
      value={value}
      placeholder={configured ? "已配置,留空保持" : "未配置"}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 py-1"
    />
  );
}

export function TextRow({
  label,
  testid,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
      <span className="w-56 shrink-0 text-[#93b2ce]">{label}</span>
      <Input
        data-testid={testid}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-64 py-1"
      />
    </label>
  );
}

export function CheckRow({
  label,
  hint,
  testid,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  testid: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <Switch data-testid={testid} checked={checked} onChange={onChange} ariaLabel={label} />
      <span className="text-[#93b2ce]">
        {label}
        {hint ? <span className="ml-2 text-xs text-[#6482a3]">{hint}</span> : null}
      </span>
    </label>
  );
}

export function GroupSection({
  name,
  title,
  description,
  children,
}: {
  name: GroupName;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`settings-group-${name}`}
      className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
    >
      <div>
        <h2 className="font-semibold text-[#dcebf7]">{title}</h2>
        <p className="text-xs text-[#6482a3]">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function useGroupSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 返回是否成功:敏感字段成功后须清空 state(refresh 重渲染会把 state 写进 DOM value) */
  async function save(group: GroupName, values: Record<string, unknown>) {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await requestJson("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group, values }),
      });
      setSaved(true);
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, saved, error, save };
}

export function SaveBar({
  group,
  busy,
  saved,
  error,
  onSave,
}: {
  group: GroupName;
  busy: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        data-testid={`settings-save-${group}`}
        type="button"
        variant="primary"
        disabled={busy}
        onClick={onSave}
      >
        {busy ? "保存中…" : "保存"}
      </Button>
      {saved ? (
        <span data-testid={`settings-result-${group}`} className="text-sm text-[#6ee7b7]">
          已保存,即时生效
        </span>
      ) : null}
      {error ? (
        <span data-testid={`settings-result-${group}`} className="text-sm text-[#eda9a9]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
