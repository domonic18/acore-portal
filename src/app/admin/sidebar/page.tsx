import { requireAdmin } from "@/server/session-guard";
import { listAllSidebarCards } from "@/server/services/sidebar/query";
import { SidebarManager } from "@/components/admin/sidebar-manager";

/** 侧栏快捷入口管理(M4 通用化):卡片增删改/排序 + 页面范围,保存即时生效 */
export default async function AdminSidebarPage() {
  await requireAdmin();
  const cards = await listAllSidebarCards();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">侧栏快捷入口</h1>
      <p className="text-sm text-[#6482a3]">
        卡片按列表顺序渲染;每卡可配置标题、正文与多个链接,并按页面类型选择展示位置。
      </p>
      <SidebarManager cards={cards} />
    </div>
  );
}
