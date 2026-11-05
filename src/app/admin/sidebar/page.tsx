import { requireAdmin } from "@/server/session-guard";
import {
  listAllSidebarCards,
  listSidebarComponentPages,
} from "@/server/services/sidebar/query";
import { SidebarManager } from "@/components/admin/sidebar-manager";

/** 侧栏管理(M4 通用化):快捷卡增删改/排序 + 内置组件页面范围,保存即时生效 */
export default async function AdminSidebarPage() {
  await requireAdmin();
  const [cards, components] = await Promise.all([
    listAllSidebarCards(),
    listSidebarComponentPages(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">侧栏管理</h1>
      <p className="text-sm text-[#6482a3]">
        内置组件(在线人数/最新资讯/QQ 群/积分余额)按页面类型选择展示位置;
        快捷卡可增删改排序,每卡可配置标题、正文与多个链接。
      </p>
      <SidebarManager cards={cards} components={components} />
    </div>
  );
}
