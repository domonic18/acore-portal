import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import type { CartLine } from "@/server/services/shop/cart";
import { ContentPanel } from "@/components/site/content-panel";
import { CartLineControls } from "@/components/shop/cart-line-controls";

/**
 * T024 购物车页(/cart 旧路径不变 FR-109):游客引导登录(FR-111/112);
 * 登录态行参数逐行可见复核(characterGuid 映射角色名,游戏库不可达降级 #guid);
 * 售罄/下架行可见但标记,结算拦截在 US3 结账层。
 * 内容区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
 */

const CART_PARAM_LABEL: Record<string, string> = {
  characterGuid: "角色",
  restoreItemEntry: "恢复物品",
  unlockName: "目标名字",
};

function paramDisplay(key: string, value: unknown, guidNames: Map<number, string>): string {
  const label = CART_PARAM_LABEL[key] ?? key;
  if (key === "characterGuid" && typeof value === "number") {
    return `${label}:${guidNames.get(value) ?? `#${value}`}`;
  }
  if (key === "restoreItemEntry" && typeof value === "number") {
    return `${label}:#${value}`;
  }
  return `${label}:${String(value)}`;
}

export default async function CartPage() {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  if (!session) {
    return (
      <main className="container-site flex flex-1 items-center justify-center py-10">
        <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold text-[#dcebf7]">购物车</h1>
          <p className="text-[#93b2ce]">登录后查看你的购物车。</p>
          <Link
            href="/login?next=/cart"
            className="rounded-md bg-[#5ea3cc] px-4 py-2 font-medium text-[#0a1220] hover:bg-[#6fb7e0]"
          >
            去登录
          </Link>
        </ContentPanel>
      </main>
    );
  }

  const [lines, characters] = await Promise.all([
    getCartLines(BigInt(session.userId)),
    listAccountCharacters(BigInt(session.userId)).catch(() => null),
  ]);
  const guidNames = new Map((characters ?? []).map((c) => [c.guid, c.name]));
  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const blocked = lines.some((l) => l.soldOut || !l.published);

  return (
    <main className="container-site flex-1 py-6">
      <ContentPanel className="p-5 lg:p-6">
        <header className="flex items-center justify-between border-b border-[#22385a] pb-3">
          <h1 className="text-2xl font-bold text-[#dcebf7]">购物车</h1>
          <Link href="/shop" className="text-sm text-[#6482a3] hover:text-[#6fb7e0]">
            继续购物
          </Link>
        </header>

        {lines.length === 0 ? (
          <p className="py-16 text-center text-[#93b2ce]">
            购物车还是空的,去
            <Link href="/shop" className="mx-1 text-[#6fb7e0] underline">
              商城
            </Link>
            逛逛吧。
          </p>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-3">
              {lines.map((line) => (
                <CartRow key={line.id} line={line} guidNames={guidNames} />
              ))}
            </ul>
            <footer className="mt-4 flex flex-col items-end gap-3 border-t border-[#22385a] pt-4">
              <p className="text-lg text-[#93b2ce]">
                合计:<span className="font-bold text-[#e8c877]">{total}</span>
              </p>
              {blocked && (
                <p className="text-sm text-[#e8c877]">
                  购物车中存在售罄或已下架商品,结算时将无法提交。
                </p>
              )}
              <Link
                href="/checkout"
                className="rounded-md bg-[#5ea3cc] px-6 py-2 font-semibold text-[#0a1220] hover:bg-[#6fb7e0]"
              >
                去结算
              </Link>
            </footer>
          </>
        )}
      </ContentPanel>
    </main>
  );
}

function CartRow({ line, guidNames }: { line: CartLine; guidNames: Map<number, string> }) {
  const params = Object.entries(line.params)
    .map(([k, v]) => paramDisplay(k, v, guidNames))
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-[#22385a] bg-[#13233a] p-4">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded bg-gradient-to-br from-[#0d1828] to-[#13233a] text-2xl"
      >
        {line.sku.startsWith(ITEMSEND_SKU_PREFIX) ? "⚔" : "🛠"}
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Link
          href={`/shop/${line.slug}`}
          className="font-semibold text-[#dcebf7] hover:text-[#6fb7e0]"
        >
          {line.name}
        </Link>
        <span className="text-xs text-[#6482a3]">{params}</span>
        <span className="flex gap-2 text-xs">
          {line.onSale && <span className="text-red-400">促销中</span>}
          {line.soldOut && <span className="text-red-400">已售罄</span>}
          {!line.published && <span className="text-[#e8c877]">已下架</span>}
        </span>
      </div>
      <div className="flex flex-col items-end text-sm text-[#93b2ce]">
        <span className={line.onSale ? "font-semibold text-[#e8c877]" : ""}>
          {line.unitPrice} × {line.qty}
        </span>
        <span className="text-[#6482a3]">小计 {line.subtotal}</span>
      </div>
      <CartLineControls itemId={line.id} qty={line.qty} soldOut={line.soldOut} />
    </li>
  );
}
