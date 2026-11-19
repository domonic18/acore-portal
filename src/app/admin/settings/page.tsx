import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { GeneralSettingsCard } from "@/components/admin/settings-forms/general-card";

/** 系统设置 · 常规(站点地址/站点信息/内容展示/站点外观/外部工具站 五分区整卡) */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        配置存 system_config 表,保存后立即热生效(无需重启);密钥仅写入不回显。
      </p>
      <GeneralSettingsCard
        view={{
          app: view.app,
          site: view.site,
          content: view.content,
          appearance: view.appearance,
          tools: view.tools,
        }}
      />
    </div>
  );
}
