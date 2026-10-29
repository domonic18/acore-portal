import { requireSession } from "@/server/session-guard";
import { ACCOUNT_NAV } from "@/constants/navigation";

/**
 * 八页统一入口:RSC 深校验守卫(FR-014 吊销态兜底)+ 导航(FR-016 未登录由 middleware/layout 引导 /login)。
 * 2026-10-29:内容收进深色面板(原先透明直压页面背景图,登录后正文对比度不足)。
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
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#22385a] px-6 py-4">
          <a
            href="/account/overview"
            className="text-lg font-bold text-[#e8c877] hover:text-[#f4e3b0]"
          >
            老克塔 · 用户中心
          </a>
          <nav aria-label="用户中心导航" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {ACCOUNT_NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[#93b2ce] hover:text-[#6fb7e0]"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
