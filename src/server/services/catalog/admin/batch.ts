import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { PRODUCT_STATUS, type ProductStatusValue } from "@/constants/shop";
import { normalizeProductImages } from "../products";
import { ProductAdminError } from "./shared";

// ===== 批量操作与复制(二期商城增强) =====

export type ProductBatchAction = "publish" | "draft" | "list" | "unlist";

const BATCH_ACTION_DATA: Record<
  ProductBatchAction,
  { status?: ProductStatusValue; listed?: boolean }
> = {
  publish: { status: PRODUCT_STATUS.PUBLISHED },
  draft: { status: PRODUCT_STATUS.DRAFT },
  list: { listed: true },
  unlist: { listed: false },
};

/** 批量上下架/目录显隐(不含删除:删除有订单安全与逐行审计语义,保持逐行) */
export async function batchSetProducts(
  ids: bigint[],
  action: ProductBatchAction,
  actorId: bigint,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const result = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: BATCH_ACTION_DATA[action],
  });
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_BATCH_UPDATED,
    actorUserId: actorId,
    payload: { action, count: result.count, ids: ids.map((id) => id.toString()) },
  });
  return { updated: result.count };
}

function appendSuffix(base: string, suffix: string, max: number): string {
  return base.length + suffix.length <= max
    ? `${base}${suffix}`
    : `${base.slice(0, max - suffix.length)}${suffix}`;
}

/**
 * 复制商品:仅服务类可复制——物品类 SKU=itemsend_{游戏物品ID} 是商城与游戏世界的
 * 唯一映射契约(宪法铁律③),同一物品不能对应两个 SKU。
 * 副本重置为安全初值(草稿、无促销、无库存),sku/slug 追加 -copy 序号避让。
 * 处理器键(handler_key)随源商品继承 —— 副本与源商品发货行为一致,
 * `-copy` 后缀只影响 SKU 唯一标识,不再影响发货(2026-11-08 整改)。
 */
export async function duplicateProduct(
  id: bigint,
  actorId: bigint,
): Promise<{ id: bigint }> {
  const source = await prisma.product.findUnique({ where: { id } });
  if (!source) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
  if (source.type === "game_item") {
    throw new ProductAdminError(
      "DUPLICATE_UNSUPPORTED",
      "物品类商品不可复制:同一游戏物品只能映射一个 itemsend_{id} SKU。",
    );
  }

  let attempt = 1;
  for (;;) {
    const suffix = attempt === 1 ? "-copy" : `-copy-${attempt}`;
    const sku = appendSuffix(source.sku, suffix, 64);
    const slug = appendSuffix(source.slug, suffix, 128);
    const clash = await prisma.product.findFirst({
      where: { OR: [{ sku }, { slug }] },
      select: { id: true },
    });
    if (!clash) {
      const created = await prisma.product.create({
        data: {
          type: source.type,
          sku,
          slug,
          name: `${source.name}(副本)`.slice(0, 128),
          description: source.description,
          ...(source.images === null
            ? {}
            : { images: normalizeProductImages(source.images) }),
          detailMd: source.detailMd,
          categoryId: source.categoryId,
          status: PRODUCT_STATUS.DRAFT,
          listed: true,
          price: source.price,
          salePrice: null,
          saleStart: null,
          saleEnd: null,
          stockEnabled: false,
          stock: null,
          lowStockThreshold: source.lowStockThreshold,
          // 服务类恒限购 1 件(单次购买一次;发货完成后释放额度,可再次购买)
          maxPerUser: source.type === "service" ? 1 : source.maxPerUser,
          gameItemId: null,
          handlerKey: source.handlerKey,
          featured: false,
        },
        select: { id: true },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SHOP,
        action: AUDIT_ACTION.PRODUCT_DUPLICATED,
        actorUserId: actorId,
        payload: {
          sourceId: id.toString(),
          targetId: created.id.toString(),
          sku,
        },
      });
      return { id: created.id };
    }
    attempt += 1;
  }
}
