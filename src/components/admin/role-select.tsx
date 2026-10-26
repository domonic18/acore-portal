"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/** 行内角色分配(改后即吊销目标全部会话,提示文案同步告知) */
export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [value, setValue] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  async function apply(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "角色修改失败,请稍后重试。");
        setValue(role);
        return;
      }
      setChanged(true);
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
      setValue(role);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <select
          value={value}
          disabled={busy || !hydrated}
          onChange={(e) => {
            setValue(e.target.value);
            void apply(e.target.value);
          }}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white disabled:opacity-50"
          aria-label="分配角色"
        >
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
        {changed && !error && <span className="text-xs text-green-400">已保存,该用户会话已重置</span>}
      </span>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
