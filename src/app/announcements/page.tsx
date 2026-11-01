import { ArchivePage } from "@/components/content/archive-page";
import { getArchiveView } from "@/server/services/content/archive-view";

export const metadata = { title: "公告 · 老克塔" };

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const view = await getArchiveView({ categorySlug: "announcements", searchParams });
  return <ArchivePage categorySlug="announcements" title="公告" {...view} />;
}
