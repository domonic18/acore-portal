import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { getCdnHosts } from "@/lib/config";
import { renderMarkdown } from "@/lib/markdown";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { getProductDetail } from "@/server/services/catalog/products";
import { cartParamFields } from "@/server/services/shop/param-schemas";
import { listAccountCharacters } from "@/server/services/account/characters";
import type { CharacterOption } from "@/components/shop/character-select";
import type { CartParamField } from "@/components/shop/add-to-cart-form";
import { AddToCartForm } from "@/components/shop/add-to-cart-form";
import { ProductGallery } from "@/components/shop/product-gallery";
import { WowheadItemLink } from "@/components/shop/wowhead-item-link";

/**
 * T021 商品详情(/shop/[slug]):draft/不存在→404;listed=false 直链可达带标记
 * (FR-127);促销划线价(FR-115 服务端判定);物品类 Wowhead 浮窗(离线降级外链);
 * 加购区登录态渲染角色下拉,游戏库不可达降级提示不阻塞浏览;
 * 图库+说明区 Markdown(WP 对齐:featured image+带图正文;detailMd 空=回退简介)。
 */
export default async function ProductDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  // 动态 params 不自动解码(post/[slug] 同口径);slug 已在导入层归一为中文明文
  const detail = await getProductDetail(decodeURIComponent(params.slug));
  if (!detail) notFound();

  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  let characters: CharacterOption[] | null = null;
  let gameDbDegraded = false;
  if (session) {
    try {
      const rows = await listAccountCharacters(BigInt(session.userId));
      characters = rows.map((c) => ({
        guid: c.guid,
        name: c.name,
        race: c.race,
        class: c.class,
        level: c.level,
      }));
    } catch {
      gameDbDegraded = true;
    }
  }

  const fields = cartParamFields(detail.sku);
  const loginHref = `/login?next=${encodeURIComponent(`/shop/${detail.slug}`)}`;
  // 详情 Markdown 与文章同管线同白名单(图片域=站内+CDN),detailMd 空回退纯文本简介
  const detailHtml = detail.detailMd
    ? (await renderMarkdown(detail.detailMd, { cdnHosts: await getCdnHosts() })).html
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <nav aria-label="面包屑" className="text-sm text-gray-400">
        <Link href="/shop" className="hover:text-white">
          商城
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/shop?category=${detail.categorySlug}`} className="hover:text-white">
          {detail.categoryName}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-200">{detail.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <ProductGallery
          images={detail.images}
          alt={detail.name}
          fallbackIcon={detail.type === "game_item" ? "⚔" : "🛠"}
        />

        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          {!detail.listed && (
            <p className="w-fit rounded bg-amber-950/60 px-2 py-1 text-xs text-amber-400">
              未在商城列表展示,当前为直链访问
            </p>
          )}
          <p className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-amber-400">{detail.effectivePrice}</span>
            {detail.onSale && (
              <>
                <span className="text-lg text-gray-500 line-through">{detail.price}</span>
                <span className="rounded bg-red-950 px-2 py-0.5 text-xs text-red-400">促销</span>
              </>
            )}
          </p>

          {detail.stockEnabled && (
            <p className="text-sm text-gray-400">
              {(detail.stock ?? 0) <= 0 ? (
                <span className="text-red-400">已售罄</span>
              ) : (
                <>库存 {detail.stock}</>
              )}
            </p>
          )}

          {detail.type === "game_item" && detail.gameItemId !== null && (
            <WowheadItemLink itemId={detail.gameItemId} />
          )}

          {gameDbDegraded && (
            <p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-400">
              游戏数据暂时不可用,角色列表加载失败,请稍后刷新重试。
            </p>
          )}

          {fields !== null ? (
            <AddToCartForm
              productId={detail.id}
              fields={fields as CartParamField[]}
              characters={characters}
              loginHref={loginHref}
              soldOut={detail.stockEnabled && (detail.stock ?? 0) <= 0}
            />
          ) : (
            <p className="rounded border border-gray-700 p-4 text-sm text-gray-400">
              该商品暂不支持在线购买。
            </p>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-2 border-t border-gray-800 pt-4">
        <h2 className="text-lg font-semibold">商品说明</h2>
        {detailHtml ? (
          <div
            data-testid="product-detail-md"
            className={MARKDOWN_BODY_CLS}
            dangerouslySetInnerHTML={{ __html: detailHtml }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6 text-gray-300">
            {detail.description}
          </p>
        )}
      </section>
    </main>
  );
}
