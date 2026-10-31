import { requireSession } from "@/server/session-guard";
import { listInbox } from "@/server/services/notification/inbox";
import { InboxList } from "./inbox-list";

/** 收件箱页(FR-308):RSC 首屏+client 游标翻页;守卫由 (account)/account/layout 兜底 */
export default async function NotificationsPage() {
  const session = await requireSession();
  const page = await listInbox(BigInt(session.userId));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">通知</h1>
      <InboxList initial={page.items} initialCursor={page.nextCursor} />
    </main>
  );
}
