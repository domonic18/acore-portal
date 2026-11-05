import Link from "next/link";
import type { Metadata } from "next";
import { ContentPanel } from "@/components/site/content-panel";

/**
 * 旧 WP 个人资料子页兼容(规格 §14:提示页,非 301):
 * 教程截图与外部引用硬编码 /wp-admin/profile.php?page=acore-item-restore|acore-raf,
 * 功能已并入「我的账户」;按 page 键给出对应新入口,未知键落通用引导。
 * 该路径不在 middleware matcher 内,直接由本页渲染(rewrite 会丢查询参数)。
 */
export const metadata: Metadata = { title: "功能已迁移 · 老克塔" };

type LegacyPage = { label: string; href: string };

const LEGACY_PAGES: Record<string, LegacyPage> = {
  // 2026-11-05:物品恢复从用户中心迁至积分商店(服务类商品),旧入口改指商店
  "acore-item-restore": { label: "物品恢复", href: "/shop" },
  "acore-raf": { label: "RAF 招募", href: "/account/raf" },
};

export default function LegacyProfilePage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const pageKey = searchParams.page ?? "";
  const target = LEGACY_PAGES[pageKey];

  return (
    <main className="container-site flex flex-1 items-center justify-center py-10">
      <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm font-medium tracking-widest text-[#c9a227]">旧版入口</p>
        <h1 className="text-xl font-bold text-[#dcebf7]">
          {target ? `${target.label}已迁移` : "该页面已迁移"}
        </h1>
        <p className="max-w-md text-sm leading-7 text-[#8fa0b8]">
          {target
            ? `旧版 ${target.label} 入口已并入「我的账户」,请从新入口继续操作;登录后将自动进入对应功能页。`
            : "旧版个人资料子页已并入「我的账户」,相关自助服务请从用户中心进入。"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href={target?.href ?? "/account/overview"}
            className="rounded bg-[#c9a227] px-4 py-2 font-medium text-[#1a1408] hover:bg-[#dbb535]"
          >
            前往{target?.label ?? "我的账户"}
          </Link>
          <Link
            href="/account/overview"
            className="rounded border border-[#243350] px-4 py-2 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
          >
            我的账户
          </Link>
          <Link
            href="/"
            className="rounded border border-[#243350] px-4 py-2 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
          >
            返回首页
          </Link>
        </div>
      </ContentPanel>
    </main>
  );
}
