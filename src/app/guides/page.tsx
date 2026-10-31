import { ArchivePage } from "@/app/_components/content/archive-page";

export const metadata = { title: "资料梳理 · 老克塔" };

export default function GuidesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  return <ArchivePage categorySlug="guides" title="资料梳理" searchParams={searchParams} />;
}
