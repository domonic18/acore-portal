"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * 状态人工两键表单(2026-11-03 起收敛:当前阶段指针唯一真相源=渐进计划页,
 * 此处不再重复配置)。PUT /api/admin/status-config → reloadSystemConfig 即时生效。
 */
export function ServerStatusConfigForm({
  enabled,
  maintenanceMode,
  currentNodeTitle,
}: {
  enabled: boolean;
  maintenanceMode: boolean;
  /** 只读展示:当前阶段指针(由渐进计划页管理) */
  currentNodeTitle: string | null;
}) {
  const router = useRouter();
  const [showStatus, setShowStatus] = useState(enabled);
  const [maintenance, setMaintenance] = useState(maintenanceMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await requestJson("/api/admin/status-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: showStatus, maintenanceMode: maintenance }),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#22385a] bg-[#13233a] p-4">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block text-[#dcebf7]">状态卡展示开关</span>
          <span className="text-xs text-[#6482a3]">
            关闭后 /api/status 返回 enabled:false,首页状态卡整卡隐藏
          </span>
        </span>
        <Switch
          checked={showStatus}
          onChange={setShowStatus}
          ariaLabel="状态卡展示开关"
        />
      </label>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block text-[#dcebf7]">维护模式</span>
          <span className="text-xs text-[#6482a3]">开启后状态卡显示「维护模式」徽标</span>
        </span>
        <Switch
          checked={maintenance}
          onChange={setMaintenance}
          ariaLabel="维护模式"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#22385a]/70 bg-[#0b1526]/60 px-3 py-2 text-sm">
        <span className="text-[#93b2ce]">
          当前渐进阶段:
          <span className="ml-1 text-[#dcebf7]">{currentNodeTitle ?? "未设置(回退末位开放节点)"}</span>
        </span>
        <span className="text-xs text-[#6482a3]">
          唯一配置入口在{" "}
          <Link
            href="/admin/progression"
            className="rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
          >
            渐进计划(设为当前)
          </Link>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          data-testid="status-config-save"
          disabled={busy}
          onClick={save}
        >
          保存配置
        </Button>
        {saved && <span className="text-xs text-[#6ee7b7]">已保存,即时生效。</span>}
        {error && <span className="text-xs text-[#eda9a9]">{error}</span>}
      </div>
    </div>
  );
}
