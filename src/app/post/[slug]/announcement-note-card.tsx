import Link from "next/link";
import { ContentAsideCard } from "@/components/content/aside-card";

/** 公告类文章右栏提示卡(页面私有,与 page 同目录):公告推送站内信的查看指引 */
export function AnnouncementNoteCard() {
  return (
    <ContentAsideCard title="公告通知" testId="article-announcement-note">
      <p className="text-[13px] leading-6 text-[#93b2ce]">
        公告发布后自动推送至站内信,可在通知中心查看。
      </p>
      <Link
        href="/account/notifications"
        className="mt-2 inline-block text-[12px] text-[#6482a3] hover:text-[#6fb7e0]"
      >
        查看通知中心 →
      </Link>
    </ContentAsideCard>
  );
}
