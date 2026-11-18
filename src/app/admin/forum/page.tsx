import { listAdminBoards } from "@/server/services/forum/admin";
import { ForumBoardManager } from "@/components/admin/forum-board-manager";

/**
 * 后台版块管理(2026-11-18 拆页:主题管理迁 /admin/forum/threads,Tab 由 layout 承载)。
 */
export default async function AdminForumPage() {
  const boards = await listAdminBoards();
  return <ForumBoardManager boards={boards} />;
}
