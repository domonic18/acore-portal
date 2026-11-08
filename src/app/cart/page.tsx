import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { getPointBalance } from "@/server/services/points/view";
import { getCartLines } from "@/server/services/shop/cart";
import { listAccountCharacters } from "@/server/services/account/characters";
import { ContentPanel } from "@/components/site/content-panel";
import { LineItemsTable } from "@/components/shop/line-items-table";

/**
 * T024 购物车页(/cart 旧路径不变 FR-109):游客引导登录(FR-111/112);
 * 登录态行参数逐行可见复核(characterGuid 映射角色名,游戏库不可达降级 #guid);
 * 售罄/下架行可见但标记,结算拦截在 US3 结账层;
 * 结算前展示玩家当前积分与本次需花费积分(#155)。
 * 内容区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
 */

export default async function CartPage() {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = token ? await getSessionFromToken(token) : null;

  if (!session) {
    return (
      <main className="container-site flex flex-1 items-center justify-center py-10">
        <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold text-heading">购物车</h1>
          <p className="text-body">登录后查看你的购物车。</p>
          <Link
            href="/login?next=/cart"
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
  const blocked = lines.some((l) => l.soldOut || !l.published);

  return (
    <main className="container-site flex-1 py-6">
      <ContentPanel className="p-5 lg:p-6">
        <header className="flex items-center justify-between border-b border-line pb-3">
          <h1 className="text-2xl font-bold text-heading">购物车</h1>
          <Link href="/shop" className="text-sm text-muted hover:text-link">
            继续购物
          </Link>
        </header>

        {lines.length === 0 ? (
          <p className="py-16 text-center text-body">
            购物车还是空的,去
            <Link href="/shop" className="mx-1 text-link underline">
              商城
            </Link>
            逛逛吧。
          </p>
        ) : (
          <>
            <LineItemsTable rows={lines} guidNames={guidNames} editable />
            <footer className="mt-4 flex flex-col items-end gap-3 border-t border-line pt-4">
              <p className="text-sm text-muted">
                当前积分:
                <span
                  className={
                    balance !== null && balance < total
                      ? "font-semibold text-red-400"
                      : "font-semibold text-heading"
                  }
                >
                  {balance ?? "不可用"}
                </span>
              </p>
              <p className="text-lg text-body">
                本次需花费:
                <span className="font-bold text-highlight">{total}</span> 积分
              </p>
              {blocked && (
                <p className="text-sm text-highlight">
                  购物车中存在售罄或已下架商品,结算时将无法提交。
                </p>
              )}
              <Link
                href="/checkout"
                className="rounded-md bg-accent px-6 py-2 font-semibold text-page hover:bg-link"
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
