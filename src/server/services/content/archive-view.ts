import "server-only";
import { ARCHIVE_PAGE_SIZE } from "@/constants/pagination";
import { listArchiveArticles, listHotNews } from "./articles";

export type ArchiveView = Awaited<ReturnType<typeof getArchiveView>>;

/**
 * 归档页取数(T023):分页/搜索参数归一 + 列表 + 右栏热门资讯。
 * 展示组件只接收结果,不再直连 server/。
 */
export async function getArchiveView(input: {
  categorySlug: string;
  searchParams: { page?: string; q?: string };
  pageSize?: number;
}) {
  const page = Math.max(1, Number.parseInt(input.searchParams.page ?? "1", 10) || 1);
  const q = input.searchParams.q?.trim() || undefined;
  const [{ items, total, pageSize }, hot] = await Promise.all([
    listArchiveArticles({
      categorySlug: input.categorySlug,
      page,
      q,
      pageSize: input.pageSize ?? ARCHIVE_PAGE_SIZE,
    }),
    listHotNews(5),
  ]);
  return { page, q, items, total, pageSize, hot };
}
