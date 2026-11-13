import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { getPointBalance } from "@/server/services/points/view";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import { ContentPanel } from "@/components/site/content-panel";
import { LineItemsTable } from "@/components/shop/line-items-table";
import { CheckoutButton } from "@/components/shop/checkout-button";

/**
 * T034 结算页(FR-111 游客引导登录):购物车行参数复核+余额展示(不足即禁付);
 * 支付经 POST /api/checkout(服务端事务复检),页面仅呈现不做权威校验。
 * 内容区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
 */

export default async function CheckoutPage() {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  if (!session) {
    return (
      <main className="container-site flex flex-1 items-center justify-center py-10">
        <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold text-heading">确认结算</h1>
          <p className="text-body">登录后完成结算。</p>
          <Link
            href="/login?next=/checkout"
            className="rounded-md bg-accent px-4 py-2 font-medium text-page hover:bg-link"
          >
            去登录
          </Link>
        </ContentPanel>
      </main>
    );
  }

  const userId = BigInt(session.userId);
  const [lines, characters, balance] = await Promise.all([
    getCartLines(userId),
    listAccountCharacters(userId).catch(() => null),
    getPointBalance(userId),
  ]);
  const guidNames = new Map((characters ?? []).map((c) => [c.guid, c.name]));
  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const blocked = lines.length === 0 || lines.some((l) => l.soldOut || !l.published);
  const insufficient = balance !== null && balance < total;

  return (
    <main className="container-site flex-1 py-6">
      <ContentPanel className="p-5 lg:p-6">
        <header className="flex items-center justify-between border-b border-line pb-3">
          <h1 className="text-2xl font-bold text-heading">确认结算</h1>
          <Link href="/cart" className="text-sm text-muted hover:text-link">
            返回购物车
          </Link>
        </header>

        {lines.length === 0 ? (
          <p className="py-16 text-center text-body">
            购物车是空的,去
            <Link href="/shop" className="mx-1 text-link underline">
              商城
            </Link>
            挑选商品吧。
          </p>
        ) : (
          <>
            <LineItemsTable rows={lines} guidNames={guidNames} />
            <footer className="mt-4 flex flex-col items-end gap-3 border-t border-line pt-4">
              <p className="text-sm text-muted">
                当前余额:
                <span
                  className={
                    insufficient
                      ? "font-semibold text-red-400"
                      : "font-semibold text-heading"
                  }
                >
                  {balance ?? "不可用"}
                </span>
              </p>
              <p className="text-lg text-body">
                应付:<span className="font-bold text-highlight">{total}</span> 积分
              </p>
              {blocked && (
                <p className="text-sm text-highlight">
                  购物车中存在售罄或已下架商品,无法结算。
                </p>
              )}
              {!insufficient || blocked ? null : (
                <p className="text-sm text-red-400">余额不足,请先充值或调整购物车。</p>
              )}
              <CheckoutButton total={total} disabled={blocked || insufficient || balance === null} />
            </footer>
          </>
        )}
      </ContentPanel>
    </main>
  );
}
