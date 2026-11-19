import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { CaptchaGroup } from "@/components/admin/settings-forms/captcha-group";
import { SecurityGroup } from "@/components/admin/settings-forms/security-group";

/** 系统设置 · 安全(人机验证 + 登录防滥用) */
export default async function AdminSettingsSecurityPage() {
  await requireAdmin();
  const view = await getSettingsView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        人机校验与登录防滥用参数;密钥只写不读,启用校验时四件套须齐全。
      </p>
      <CaptchaGroup view={view.captcha} />
      <SecurityGroup view={view.security} />
    </div>
  );
}
