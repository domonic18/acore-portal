import { ArchivePage } from "@/app/_components/content/archive-page";

export const metadata = { title: "公告 · 老克塔" };

export default function AnnouncementsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  return <ArchivePage categorySlug="announcements" title="公告" searchParams={searchParams} />;
}
