import { requireSession } from "@/server/session-guard";
import { AccountNav } from "./account-nav";

/**
 * 八页统一入口:RSC 深校验守卫(FR-014 吊销态兜底)+ 导航(FR-016 未登录由 middleware/layout 引导 /login)。
 * 2026-10-29:内容收进深色面板(原先透明直压页面背景图,登录后正文对比度不足)。
 * 2026-11-04 #63:导航移出页头改独立 tab 条——9 项挤页头右侧在移动端折成参差两行。
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="container-site py-6">
      <div
        data-testid="account-shell"
        className="overflow-hidden rounded-2xl border border-[#22385a] bg-[#0d1a2e]/95"
      >
        <header className="border-b border-[#22385a] px-4 py-4 sm:px-6">
          <a
            href="/account/overview"
            className="text-lg font-bold text-[#e8c877] hover:text-[#f4e3b0]"
          >
            老克塔 · 用户中心
          </a>
        </header>
        <AccountNav />
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
