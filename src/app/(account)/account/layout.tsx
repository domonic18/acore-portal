import { requireSession } from "@/server/session-guard";
import { ACCOUNT_NAV } from "@/constants/navigation";

/** 八页统一入口:RSC 深校验守卫(FR-014 吊销态兜底)+ 导航(FR-016 未登录由 middleware/layout 引导 /login) */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-gray-800 pb-3">
        <a href="/account/overview" className="text-lg font-bold">
          老克塔 · 用户中心
        </a>
        <nav aria-label="用户中心导航" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {ACCOUNT_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-gray-300 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
