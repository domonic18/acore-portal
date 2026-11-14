"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { USER_ROLES } from "@/constants/roles";
import { errorMessage, requestJson } from "@/lib/api-client";
import { needsElevationConfirm } from "@/lib/role-elevation";

/**
 * 用户详情页的角色分配(FR-105/FR-130):独立控件放在页头右侧,
 * 与「积分手调 / 徽章授予」这类日常操作分离(低频且不可逆,不该占据页面首要位置)。
 * 提升为 admin 前必须二次确认(admin 可管理全站数据);成功后吊销目标全部会话并刷新。
 */
export function RoleAssign({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [roleValue, setRoleValue] = useState(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function assignRole() {
    if (needsElevationConfirm(role, roleValue)) {
      const ok = window.confirm(
        "确认把该用户提升为 admin?admin 可进入后台管理全站数据(用户、订单、积分、内容)。",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await requestJson(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: roleValue }),
      });
      setMsg("已保存,该用户会话已重置");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">角色(分配后立即吊销该用户全部会话)</span>
          <Select
            value={roleValue}
            onChange={(e) => setRoleValue(e.target.value)}
            className="w-auto min-w-32"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </label>
        <Button
          type="button"
          variant="primary"
          disabled={busy || roleValue === role}
          onClick={() => void assignRole()}
        >
          {busy ? "分配中…" : "分配角色"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
      {msg && <p className="text-sm text-[#6ee7b7]">{msg}</p>}
    </div>
  );
}
