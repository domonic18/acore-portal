import { ArchivePage } from "@/app/_components/content/archive-page";

export const metadata = { title: "资讯 · 老克塔" };

export default function NewsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  return <ArchivePage categorySlug="news" title="资讯" searchParams={searchParams} />;
}
