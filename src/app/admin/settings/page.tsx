import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { SettingsForms } from "@/components/admin/settings-forms";

/** 系统设置后台(T032;api-admin-m4 契约):七组表单+测试发信卡片 */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">系统设置</h1>
      <p className="text-sm text-gray-500">
        配置存 system_config 表,保存后立即热生效(无需重启);密钥仅写入不回显。
      </p>
      <SettingsForms view={view} />
    </div>
  );
}
