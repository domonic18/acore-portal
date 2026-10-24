import { ArchivePage } from "@/app/_components/content/archive-page";

export const metadata = { title: "开发日志 · 老克塔" };

export default function DevlogPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  return <ArchivePage categorySlug="devlog" title="开发日志" searchParams={searchParams} />;
}
