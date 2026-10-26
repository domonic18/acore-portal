import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import type { CartLine } from "@/server/services/shop/cart";
import { CartLineControls } from "@/components/shop/cart-line-controls";

/**
 * T024 购物车页(/cart 旧路径不变 FR-109):游客引导登录(FR-111/112);
 * 登录态行参数逐行可见复核(characterGuid 映射角色名,游戏库不可达降级 #guid);
 * 售罄/下架行可见但标记,结算拦截在 US3 结账层。
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
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold">购物车</h1>
        <p className="text-gray-400">登录后查看你的购物车。</p>
        <Link
          href="/login?next=/cart"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        >
          去登录
        </Link>
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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-gray-800 pb-3">
        <h1 className="text-2xl font-bold">购物车</h1>
        <Link href="/shop" className="text-sm text-gray-300 hover:text-white">
          继续购物
        </Link>
      </header>

      {lines.length === 0 ? (
        <p className="py-16 text-center text-gray-400">
          购物车还是空的,去<Link href="/shop" className="mx-1 underline">商城</Link>逛逛吧。
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <CartRow key={line.id} line={line} guidNames={guidNames} />
            ))}
          </ul>
          <footer className="flex flex-col items-end gap-3 border-t border-gray-800 pt-4">
            <p className="text-lg">
              合计:<span className="font-bold text-amber-400">{total}</span>
            </p>
            {blocked && (
              <p className="text-sm text-amber-400">购物车中存在售罄或已下架商品,结算时将无法提交。</p>
            )}
            <Link
              href="/checkout"
              className="rounded bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-500"
            >
              去结算
            </Link>
          </footer>
        </>
      )}
    </main>
  );
}

function CartRow({ line, guidNames }: { line: CartLine; guidNames: Map<number, string> }) {
  const params = Object.entries(line.params)
    .map(([k, v]) => paramDisplay(k, v, guidNames))
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-4 rounded border border-gray-800 p-4">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded bg-gradient-to-br from-indigo-950 to-gray-900 text-2xl"
      >
        {line.sku.startsWith("itemsend_") ? "⚔" : "🛠"}
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Link href={`/shop/${line.slug}`} className="font-semibold hover:underline">
          {line.name}
        </Link>
        <span className="text-xs text-gray-400">{params}</span>
        <span className="flex gap-2 text-xs">
          {line.onSale && <span className="text-red-400">促销中</span>}
          {line.soldOut && <span className="text-red-400">已售罄</span>}
          {!line.published && <span className="text-amber-400">已下架</span>}
        </span>
      </div>
      <div className="flex flex-col items-end text-sm">
        <span className={line.onSale ? "font-semibold text-amber-400" : ""}>
          {line.unitPrice} × {line.qty}
        </span>
        <span className="text-gray-500">小计 {line.subtotal}</span>
      </div>
      <CartLineControls itemId={line.id} qty={line.qty} soldOut={line.soldOut} />
    </li>
  );
}
