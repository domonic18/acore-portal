import { ArchivePage } from "@/components/content/archive-page";
import { getArchiveView } from "@/server/services/content/archive-view";

export const metadata = { title: "资料梳理 · 老克塔" };

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const view = await getArchiveView({ categorySlug: "guides", searchParams });
  return <ArchivePage categorySlug="guides" title="资料梳理" {...view} />;
}
