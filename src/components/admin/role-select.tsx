"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

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
      await requestJson(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      setChanged(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setValue(role);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <Select
          value={value}
          disabled={busy || !hydrated}
          onChange={(e) => {
            setValue(e.target.value);
            void apply(e.target.value);
          }}
          className="w-auto min-w-28 py-1"
          aria-label="分配角色"
        >
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </Select>
        {changed && !error && <span className="text-xs text-[#6ee7b7]">已保存,该用户会话已重置</span>}
      </span>
      {error && (
        <span role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </span>
      )}
    </span>
  );
}
