import { AiTabs } from "@/components/admin/ai/ai-tabs";

/**
 * 后台「AI 管理」外壳(2026-11-18 用户反馈):模型/用量/对话三区块
 * 合并为单菜单入口,页内 Tab 切换;各子页为独立 RSC(各自取数/分页)。
 */
export default function AdminAiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">AI 管理</h1>
      <AiTabs />
      {children}
    </div>
  );
}
