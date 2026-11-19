import { requireAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { ThemeManager } from "@/components/admin/theme/theme-manager";

/** 站点主题(独立菜单项):配色主题切换 + 每套主题的背景图 */
export default async function AdminThemePage() {
  await requireAdmin();
  const view = await getSettingsView();

  return <ThemeManager view={view.theme} />;
}
