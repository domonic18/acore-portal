"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 状态人工三键表单(T045;p15 字段二分:实时读数为只读由页面渲染,本表单只管三键)。
 * PUT /api/admin/status-config → reloadSystemConfig 即时生效;指针失效返回告警位。
 */
export function ServerStatusConfigForm({
  enabled,
  maintenanceMode,
  currentNodeId,
  nodes,
}: {
  enabled: boolean;
  maintenanceMode: boolean;
  currentNodeId: string | null;
  nodes: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const [showStatus, setShowStatus] = useState(enabled);
  const [maintenance, setMaintenance] = useState(maintenanceMode);
  const [nodeId, setNodeId] = useState(currentNodeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointerInvalid, setPointerInvalid] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/status-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: showStatus,
          maintenanceMode: maintenance,
          ...(nodeId === "" ? {} : { currentNodeId: nodeId }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return;
      }
      const body = (await res.json()) as { pointerInvalid?: boolean };
      setPointerInvalid(body.pointerInvalid === true);
      setSaved(true);
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded border border-gray-800 p-4">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block text-gray-200">状态卡展示开关</span>
          <span className="text-xs text-gray-500">
            关闭后 /api/status 返回 enabled:false,首页状态卡整卡隐藏
          </span>
        </span>
        <input
          data-testid="status-config-enabled"
          type="checkbox"
          checked={showStatus}
          onChange={(e) => setShowStatus(e.target.checked)}
          className="h-4 w-4"
        />
      </label>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block text-gray-200">维护模式</span>
          <span className="text-xs text-gray-500">开启后状态卡显示「维护模式」徽标</span>
        </span>
        <input
          data-testid="status-config-maintenance"
          type="checkbox"
          checked={maintenance}
          onChange={(e) => setMaintenance(e.target.checked)}
          className="h-4 w-4"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-200">当前渐进阶段指针</span>
        <select
          data-testid="status-config-node"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-gray-200"
        >
          <option value="">(未设置,回退末位开放节点)</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}({n.status === "open" ? "开放" : "未开放"})
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          指向已删节点时运行期自动回退末位开放节点,并留审计告警
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="status-config-save"
          disabled={busy}
          onClick={save}
          className="rounded border border-green-700 px-3 py-1.5 text-sm text-green-400 hover:bg-green-950 disabled:opacity-50"
        >
          保存配置
        </button>
        {saved && !pointerInvalid && (
          <span className="text-xs text-green-400">已保存,即时生效。</span>
        )}
        {pointerInvalid && (
          <span data-testid="status-config-pointer-invalid" className="text-xs text-amber-400">
            指针节点不存在,已按原样落库;运行期回退末位开放节点。
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
