import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { NotifyGroup } from "@/components/admin/settings-forms/notify-group";
import { SmtpGroup } from "@/components/admin/settings-forms/smtp-group";
import { TestMailCard } from "@/components/admin/settings-forms/test-mail-card";

/** 系统设置 · 邮件与告警(SMTP 通道 + 飞书告警 + 测试发信) */
export default async function AdminSettingsMailPage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        邮件与告警通道:SMTP 凭据只写不读,飞书 webhook 密钥同样只写不读;测试连接用候选值,不落库。
      </p>
      <SmtpGroup view={view.smtp} />
      <TestMailCard />
      <NotifyGroup view={view.notify} />
    </div>
  );
}
