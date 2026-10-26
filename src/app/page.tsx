import Link from "next/link";
import { getHomeBlocks } from "@/server/services/home/home";
import { listActiveBanners } from "@/server/services/home/banners";
import { getServerStatus } from "@/server/services/status/status";
import { getConfig } from "@/lib/config";
import { StatusCard } from "@/components/site/status-card";
import { HomeCarousel } from "@/components/site/home-carousel";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";

/**
 * 首页四区块(T027,US3;spec §US3):最新公告 5/服务器状态卡(T044 转正)/
 * 当前渐进阶段/精选商品(featured 优先回退最新上架)。侧栏按 home 类型渲染。
 * 轮播与最近成就嵌入(US 首页配置)由后台配置:轮播空物料整块隐藏,
 * 成就 iframe url 空=隐藏;/admin 改动经 reloadSystemConfig/refresh 即时生效。
 */
export default async function HomePage() {
  const [{ announcements, progression, featuredProducts }, activeBanners, config, serverStatus] =
    await Promise.all([
      getHomeBlocks(),
      listActiveBanners(),
      getConfig(),
      getServerStatus(),
    ]);
  const banners = activeBanners.map((b) => ({
    id: b.id.toString(),
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
  }));

  return (
    <main className="mx-auto max-w-6xl p-4">
      <section className="mb-6 py-10 text-center">
        <h1 className="text-3xl font-bold text-[#e6d8a8]">
          老克塔 · AzerothCore 怀旧社区
        </h1>
        <p className="mt-2 text-[#8fa0b8]">怀旧公益项目 · 60 时代经典旧世</p>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          <HomeCarousel banners={banners} intervalMs={config.home.carouselIntervalSec * 1000} />

          <section className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4 md:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold text-[#e6d8a8]">最新公告</h2>
              <Link
                href="/announcements"
                className="text-xs text-[#8fa0b8] hover:text-[#e6d8a8]"
              >
                更多 →
              </Link>
            </div>
            {announcements.length === 0 ? (
              <p className="text-sm text-[#5d6b80]">暂无公告</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {announcements.map((a) => (
                  <li key={a.slug} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="line-clamp-1 text-[#c7d2e0] hover:text-[#e6d8a8]"
                    >
                      {a.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[#5d6b80]">
                      {a.publishedAt?.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* enabled=false 时整卡隐藏(StatusCard 内部短路) */}
          <StatusCard initial={serverStatus} />

          <section className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold text-[#e6d8a8]">当前阶段</h2>
              <Link
                href="/progression"
                className="text-xs text-[#8fa0b8] hover:text-[#e6d8a8]"
              >
                渐进计划 →
              </Link>
            </div>
            <p className="text-lg font-semibold text-[#e6d8a8]">
              {progression.current?.title ?? "待定"}
            </p>
            {progression.current?.phaseDate && (
              <p className="mt-1 text-xs text-[#5d6b80]">
                开放于 {progression.current.phaseDate.toISOString().slice(0, 10)}
              </p>
            )}
            {progression.next && (
              <p className="mt-2 text-xs text-[#8fa0b8]">
                下一阶段:{progression.next.title}
              </p>
            )}
          </section>

          <section className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4 md:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold text-[#e6d8a8]">精选商品</h2>
              <Link href="/shop" className="text-xs text-[#8fa0b8] hover:text-[#e6d8a8]">
                积分商店 →
              </Link>
            </div>
            {featuredProducts.length === 0 ? (
              <p className="text-sm text-[#5d6b80]">商品即将上架。</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {featuredProducts.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/shop/${encodeURIComponent(p.slug)}`}
                      className="block rounded border border-[#1e2a3d] p-3 hover:border-[#c9a227]"
                    >
                      <p className="line-clamp-1 text-sm text-[#c7d2e0]">{p.name}</p>
                      <p className="mt-1 text-sm font-semibold text-[#c9a227]">
                        {p.price} 积分
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 最近成就嵌入(US 首页配置):url 空=整块隐藏;高度/滚动条后台可配 */}
          {config.home.achievementUrl && (
            <section className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4 md:col-span-2">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-bold text-[#e6d8a8]">最近成就</h2>
                <a
                  href={config.home.achievementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8fa0b8] hover:text-[#e6d8a8]"
                >
                  新窗口打开 →
                </a>
              </div>
              <iframe
                src={config.home.achievementUrl}
                title="最近成就"
                loading="lazy"
                scrolling={config.home.achievementScrolling ? "auto" : "no"}
                className="w-full rounded border-0 bg-[#0d1728]"
                style={{ height: config.home.achievementHeight }}
              />
            </section>
          )}
        </div>
        <SiteSidebar pageType="home" />
      </div>
    </main>
  );
}
