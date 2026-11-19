import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { GameDbGroup } from "@/components/admin/settings-forms/gamedb-group";
import { SoapGroup } from "@/components/admin/settings-forms/soap-group";

/** 系统设置 · 游戏通道(SOAP 命令层 + 游戏四库) */
export default async function AdminSettingsGamePage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        游戏侧通道配置:SOAP 发货命令层与游戏四库连接串;连接串口令只写不读,回显脱敏。
      </p>
      <SoapGroup view={view.soap} />
      <GameDbGroup view={view.gamedb} />
    </div>
  );
}
