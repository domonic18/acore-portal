import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { BackupGroup } from "@/components/admin/settings-forms/backup-group";
import { CosGroup } from "@/components/admin/settings-forms/cos-group";

/** 系统设置 · 存储与备份(对象存储 COS + 备份策略) */
export default async function AdminSettingsStoragePage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        对象存储与备份策略:COS 以桶名为开关(桶名留空=整组不生效),密钥只写不读;
        保留期即备份脚本的运行契约。
      </p>
      <CosGroup view={view.cos} />
      <BackupGroup view={view.backup} />
    </div>
  );
}
