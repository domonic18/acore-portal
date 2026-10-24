import "server-only";
import { prisma } from "@/lib/db";

/**
 * 内容查询层最小集(M3 US1 T019 侧栏数据面;US3 T022 扩全量):
 * 公告动态(图链组件)与日历归档(月度计数)。
 */

export async function listLatestAnnouncements(limit = 3) {
  return prisma.article.findMany({
    where: { status: "published", category: { slug: "announcements" } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, title: true, publishedAt: true },
  });
}

export async function archiveMonthCounts(limit = 6) {
  const rows = await prisma.$queryRaw<{ ym: string; n: bigint }[]>`
    SELECT DATE_FORMAT(published_at, '%Y-%m') AS ym, COUNT(*) AS n
      FROM article
     WHERE status = 'published' AND published_at IS NOT NULL
     GROUP BY ym
     ORDER BY ym DESC
     LIMIT ${limit}`;
  return rows.map((r) => ({ month: r.ym, count: Number(r.n) }));
}
