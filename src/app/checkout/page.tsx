import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { prisma } from "@/lib/db";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import type { CartLine } from "@/server/services/shop/cart";
import { CheckoutButton } from "@/components/shop/checkout-button";

/**
 * T034 结算页(FR-111 游客引导登录):购物车行参数复核+余额展示(不足即禁付);
 * 支付经 POST /api/checkout(服务端事务复检),页面仅呈现不做权威校验。
 */

const CART_PARAM_LABEL: Record<string, string> = {
  characterGuid: "角色",
  restoreItemEntry: "恢复物品",
  destAccount: "目标账号",
  guildName: "公会名",
  unlockName: "目标名字",
};

function paramDisplay(key: string, value: unknown, guidNames: Map<number, string>): string {
  const label = CART_PARAM_LABEL[key] ?? key;
  if (key === "characterGuid" && typeof value === "number") {
    return `${label}:${guidNames.get(value) ?? `#${value}`}`;
  }
  return `${label}:${String(value)}`;
}

export default async function CheckoutPage() {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold">确认结算</h1>
        <p className="text-gray-400">登录后完成结算。</p>
        <Link
          href="/login?next=/checkout"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        >
          去登录
        </Link>
      </main>
    );
  }

  const userId = BigInt(session.userId);
  const [lines, characters, account] = await Promise.all([
    getCartLines(userId),
    listAccountCharacters(userId).catch(() => null),
    prisma.pointAccount.findUnique({ where: { userId }, select: { balance: true } }),
  ]);
  const guidNames = new Map((characters ?? []).map((c) => [c.guid, c.name]));
  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const blocked = lines.length === 0 || lines.some((l) => l.soldOut || !l.published);
  const insufficient = account !== null && account.balance < total;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-gray-800 pb-3">
        <h1 className="text-2xl font-bold">确认结算</h1>
        <Link href="/cart" className="text-sm text-gray-300 hover:text-white">
          返回购物车
        </Link>
      </header>

      {lines.length === 0 ? (
        <p className="py-16 text-center text-gray-400">
          购物车是空的,去<Link href="/shop" className="mx-1 underline">商城</Link>挑选商品吧。
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <CheckoutRow key={line.id} line={line} guidNames={guidNames} />
            ))}
          </ul>
          <footer className="flex flex-col items-end gap-3 border-t border-gray-800 pt-4">
            <p className="text-sm text-gray-400">
              当前余额:
              <span className={insufficient ? "font-semibold text-red-400" : "font-semibold text-white"}>
                {account?.balance ?? "不可用"}
              </span>
            </p>
            <p className="text-lg">
              应付:<span className="font-bold text-amber-400">{total}</span> 积分
            </p>
            {blocked && (
              <p className="text-sm text-amber-400">
                购物车中存在售罄或已下架商品,无法结算。
              </p>
            )}
            {!insufficient || blocked ? null : (
              <p className="text-sm text-red-400">余额不足,请先充值或调整购物车。</p>
            )}
            <CheckoutButton total={total} disabled={blocked || insufficient || account === null} />
          </footer>
        </>
      )}
    </main>
  );
}

function CheckoutRow({ line, guidNames }: { line: CartLine; guidNames: Map<number, string> }) {
  const params = Object.entries(line.params)
    .map(([k, v]) => paramDisplay(k, v, guidNames))
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-4 rounded border border-gray-800 p-4">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="font-semibold">{line.name}</span>
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
    </li>
  );
}
