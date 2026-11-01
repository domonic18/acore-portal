import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { prisma } from "@/lib/db";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import type { CartLine } from "@/server/services/shop/cart";
import { ContentPanel } from "@/components/site/content-panel";
import { CheckoutButton } from "@/components/shop/checkout-button";

/**
 * T034 结算页(FR-111 游客引导登录):购物车行参数复核+余额展示(不足即禁付);
 * 支付经 POST /api/checkout(服务端事务复检),页面仅呈现不做权威校验。
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
  return `${label}:${String(value)}`;
}

export default async function CheckoutPage() {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  if (!session) {
    return (
      <main className="container-site flex flex-1 items-center justify-center py-10">
        <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold text-[#dcebf7]">确认结算</h1>
          <p className="text-[#93b2ce]">登录后完成结算。</p>
          <Link
            href="/login?next=/checkout"
            className="rounded-md bg-[#5ea3cc] px-4 py-2 font-medium text-[#0a1220] hover:bg-[#6fb7e0]"
          >
            去登录
          </Link>
        </ContentPanel>
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
    <main className="container-site flex-1 py-6">
      <ContentPanel className="p-5 lg:p-6">
        <header className="flex items-center justify-between border-b border-[#22385a] pb-3">
          <h1 className="text-2xl font-bold text-[#dcebf7]">确认结算</h1>
          <Link href="/cart" className="text-sm text-[#6482a3] hover:text-[#6fb7e0]">
            返回购物车
          </Link>
        </header>

        {lines.length === 0 ? (
          <p className="py-16 text-center text-[#93b2ce]">
            购物车是空的,去
            <Link href="/shop" className="mx-1 text-[#6fb7e0] underline">
              商城
            </Link>
            挑选商品吧。
          </p>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-3">
              {lines.map((line) => (
                <CheckoutRow key={line.id} line={line} guidNames={guidNames} />
              ))}
            </ul>
            <footer className="mt-4 flex flex-col items-end gap-3 border-t border-[#22385a] pt-4">
              <p className="text-sm text-[#6482a3]">
                当前余额:
                <span
                  className={
                    insufficient
                      ? "font-semibold text-red-400"
                      : "font-semibold text-[#dcebf7]"
                  }
                >
                  {account?.balance ?? "不可用"}
                </span>
              </p>
              <p className="text-lg text-[#93b2ce]">
                应付:<span className="font-bold text-[#e8c877]">{total}</span> 积分
              </p>
              {blocked && (
                <p className="text-sm text-[#e8c877]">
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
      </ContentPanel>
    </main>
  );
}

function CheckoutRow({ line, guidNames }: { line: CartLine; guidNames: Map<number, string> }) {
  const params = Object.entries(line.params)
    .map(([k, v]) => paramDisplay(k, v, guidNames))
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-[#22385a] bg-[#13233a] p-4">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="font-semibold text-[#dcebf7]">{line.name}</span>
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
    </li>
  );
}
