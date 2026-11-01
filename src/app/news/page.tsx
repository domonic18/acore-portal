import { ArchivePage } from "@/components/content/archive-page";
import { getArchiveView } from "@/server/services/content/archive-view";

export const metadata = { title: "资讯 · 老克塔" };

export default async function NewsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const view = await getArchiveView({
    categorySlug: "news",
    searchParams,
    pageSize: 6,
  });
  return (
    <ArchivePage categorySlug="news" title="资讯" layout="cards" {...view} />
  );
}
