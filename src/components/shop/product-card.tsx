import Link from "next/link";

/**
 * 商城商品卡(前台列表与详情页推荐位共用):
 * 结构与 /shop 列表卡片一致(主图/名称/分类/现价/划线原价),WP 原版推荐位同款。
 */
export type ProductCardProps = {
  slug: string;
  name: string;
  type: string;
  image: string | null;
  price: number;
  effectivePrice: number;
  onSale: boolean;
  categoryName: string;
};

export function ProductCard({
  slug,
  name,
  type,
  image,
  price,
  effectivePrice,
  onSale,
  categoryName,
}: ProductCardProps) {
  return (
    <Link
      href={`/shop/${slug}`}
      className="flex flex-col gap-2 rounded-md border border-line p-3 transition-colors hover:border-link"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          loading="lazy"
          draggable={false}
          className="aspect-square w-full rounded bg-panel-inset object-contain"
        />
      ) : (
        <div
          aria-hidden
          className="flex aspect-square w-full items-center justify-center rounded bg-panel-inset text-4xl"
        >
          {type === "game_item" ? "⚔" : "🛠"}
        </div>
      )}
      <span className="font-semibold">{name}</span>
      <span className="text-xs text-gray-400">{categoryName}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-amber-400">{effectivePrice}</span>
        {onSale && <span className="text-sm text-gray-500 line-through">{price}</span>}
      </span>
    </Link>
  );
}
