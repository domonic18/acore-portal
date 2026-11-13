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
      <p className="text-sm leading-6 text-[#6482a3]">
        侧栏是前台页面右侧的竖栏,由两部分组成(下列顺序即前台展示顺序):
        <br />
        ① <span className="text-[#dcebf7]">自定义快捷卡</span>——你自己配置的入口卡(如客户端下载),可增删改排序;
        ② <span className="text-[#dcebf7]">内置组件</span>——系统功能卡(在线人数/最新资讯/QQ 交流群),内容自动生成,只能选择显示页面。
      </p>
      <SidebarManager cards={cards} components={components} />
    </div>
  );
}
