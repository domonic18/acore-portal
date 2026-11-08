import "server-only";

/**
 * 后台商品/分类管理(api-admin 契约,FR-126~128):
 * SKU 保存校验——game_item ⇒ gameItemId 在 world 存在(库不可达 GameDbError 上抛,
 * 路由层 503 拒绝保存不放行)且 SKU 与该物品 ID 交叉一致;service ⇒ sku 命中处理器注册表;
 * 促销价 < 原价;sku/slug 唯一。上下架/目录隐藏不影响历史订单行快照;低库存=推导查询(R3)。
 *
 * field:出错的表单字段(sku / gameItemId),供前端把错误落到对应输入框。
 */

export class ProductAdminError extends Error {
  constructor(
    public code:
      | "SKU_GAME_ITEM_NOT_FOUND"
      | "SKU_GAME_ITEM_REQUIRED"
      | "SKU_FORMAT_INVALID"
      | "SKU_ITEM_MISMATCH"
      | "SKU_TYPE_MISMATCH"
      | "SKU_HANDLER_UNBOUND"
      | "SALE_PRICE_INVALID"
      | "DUPLICATE"
      | "CATEGORY_NOT_FOUND"
      | "PRODUCT_HAS_ORDERS"
      | "DUPLICATE_UNSUPPORTED"
      | "STOCK_NOT_APPLICABLE"
      | "NOT_FOUND",
    message?: string,
    public field?: "sku" | "gameItemId",
  ) {
    super(message ?? `product_admin_error: ${code}`);
    this.name = "ProductAdminError";
  }
}
