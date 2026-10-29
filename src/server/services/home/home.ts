import "server-only";
import { prisma } from "@/lib/db";
import { listLatestAnnouncements } from "@/server/services/content/articles";
import { resolveProgressionPosition } from "@/server/services/progression/progression";
import {
  effectivePrice,
  normalizeProductImages,
} from "@/server/services/catalog/products";

/**
 * 首页四区块聚合(M3 US3 T022/T027;spec §US3):
 * 最新公告 5 / 服务器状态卡(US6 接线,M3 占位) / 当前渐进阶段 / 精选商品
 * (featured 优先,不足回退最新上架;生效价服务端判定 FR-115)。
 */

const FEATURED_TAKE = 4;

export async function getHomeBlocks() {
  const [announcements, progression, featuredRaw, latestRaw] = await Promise.all([
    listLatestAnnouncements(5),
    resolveProgressionPosition(),
    prisma.product.findMany({
      where: { status: "published", listed: true, featured: true },
      orderBy: [{ id: "asc" }],
      take: FEATURED_TAKE,
      select: {
        slug: true,
        name: true,
        price: true,
        salePrice: true,
        saleStart: true,
        saleEnd: true,
        images: true,
      },
    }),
    prisma.product.findMany({
      where: { status: "published", listed: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FEATURED_TAKE * 2,
      select: {
        slug: true,
        name: true,
        price: true,
        salePrice: true,
        saleStart: true,
        saleEnd: true,
        images: true,
      },
    }),
  ]);

  const seen = new Set(featuredRaw.map((p) => p.slug));
  const products = [...featuredRaw, ...latestRaw.filter((p) => !seen.has(p.slug))].slice(
    0,
    FEATURED_TAKE,
  );
  const now = new Date();
  const featuredProducts = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    price: effectivePrice(p, now),
    image: normalizeProductImages(p.images)[0] ?? null,
    featured: featuredRaw.some((f) => f.slug === p.slug),
  }));

  return {
    announcements,
    progression,
    featuredProducts,
    serverStatus: null as null, // US6 状态组件接线位(T042-T046)
  };
}
