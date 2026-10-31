import { requireAdmin } from "@/server/session-guard";
import { getRawStatusConfig, getServerStatus } from "@/server/services/status/status";
import { listProgressionTimeline } from "@/server/services/progression/progression";
import { ServerStatusConfigForm } from "@/components/admin/server-status-config";

/** 状态配置后台(T045;p15 字段二分:实时读数只读 + 人工三键表单) */
export default async function AdminServerStatusPage() {
  await requireAdmin();
  const [raw, nodes, status] = await Promise.all([
    getRawStatusConfig(),
    listProgressionTimeline(),
    getServerStatus(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">状态配置</h1>

      <section className="rounded border border-gray-800 p-4 text-sm">
        <h2 className="mb-2 font-semibold text-gray-200">实时读数(只读)</h2>
        {status.enabled ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-gray-400 md:grid-cols-4">
            <div>
              运行:
              <span className="text-gray-200">
                {status.online ? "在线" : "离线"}
                {status.degraded ? "(数据延迟)" : ""}
              </span>
            </div>
            <div>
              在线:<span className="text-gray-200">{status.onlineCount ?? "--"}</span>
            </div>
            <div>
              阵营比:
              <span className="text-gray-200">
                {status.allianceCount ?? "--"} : {status.hordeCount ?? "--"}
              </span>
            </div>
            <div>
              登录队列:<span className="text-gray-200">{status.queueCount ?? "N/A"}</span>
            </div>
            <div>
              今日峰值:<span className="text-gray-200">{status.todayPeak ?? "--"}</span>
            </div>
            <div>
              角色总数:<span className="text-gray-200">{status.charTotal ?? "--"}</span>
            </div>
            <div>
              今日新注册:<span className="text-gray-200">{status.todayNewChars ?? "--"}</span>
            </div>
            <div>
              当前阶段:<span className="text-gray-200">{status.currentStage ?? "待定"}</span>
            </div>
          </dl>
        ) : (
          <p className="text-gray-500">状态卡展示已关闭,开启后此处显示实时读数。</p>
        )}
      </section>

      <ServerStatusConfigForm
        enabled={raw.enabled}
        maintenanceMode={raw.maintenanceMode}
        currentNodeId={raw.currentNodeId}
        nodes={nodes.map((n) => ({ id: n.id.toString(), title: n.title, status: n.status }))}
      />
    </div>
  );
}
