import Link from "next/link";
import { getHomeBlocks } from "@/server/services/home/home";
import { listActiveBanners } from "@/server/services/home/banners";
import { getServerStatus } from "@/server/services/status/status";
import { listHighlightedForumThreads } from "@/server/services/forum/browse";
import { getConfig } from "@/lib/config";
import { StatusCard } from "@/components/site/status-card";
import { HomeCarousel } from "@/components/site/home-carousel";
import { HomeProductCarousel } from "@/components/site/home-product-carousel";
import { SectionHeader } from "@/components/site/section-header";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";

/**
 * 首页(2026-10 与 ardot 设计稿 p01 对齐):左栏=轮播+最近成就嵌入;
 * 右栏=快捷入口/服务器状态/最新公告 5/精选商品(featured 优先回退最新上架)/
 * 当前渐进阶段,尾部接侧栏(home 类型仅积分余额,登录态门槛)。
 * 轮播空物料整块隐藏,成就 iframe url 空=隐藏;/admin 改动即时生效。
 */

/** 快捷入口(设计稿 qlinks 六行;链接落站内真实路由) */
const QUICK_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "项目简介",
    links: [
      { label: "注册方法", href: "/register" },
      { label: "渐进计划", href: "/progression" },
      { label: "硬核模式", href: "/tutorial" },
      { label: "规范要求", href: "/agreement" },
    ],
  },
  {
    title: "客户端",
    links: [
      { label: "普清端", href: "/tutorial" },
      { label: "高清端", href: "/tutorial" },
      { label: "解压方法", href: "/tutorial" },
    ],
  },
  {
    title: "登录器",
    links: [
      { label: "下载", href: "/tutorial" },
      { label: "常见登录问题", href: "/tutorial" },
    ],
  },
  {
    title: "补丁",
    links: [
      { label: "下载", href: "/tutorial" },
      { label: "补丁生效方法", href: "/tutorial" },
    ],
  },
  {
    title: "插件",
    links: [
      { label: "魔盒插件教程", href: "/tutorial" },
      { label: "黑盒插件教程", href: "/tutorial" },
    ],
  },
  {
    title: "其他",
    links: [
      { label: "英雄榜", href: "/hardcore" },
      { label: "积分商店", href: "/shop" },
      { label: "开发日志", href: "/devlog" },
      { label: "Bug反馈", href: "/forum" },
    ],
  },
];

export default async function HomePage() {
  const [
    { announcements, progression, featuredProducts },
    activeBanners,
    config,
    serverStatus,
    forumHighlights,
  ] = await Promise.all([
    getHomeBlocks(),
    listActiveBanners(),
    getConfig(),
    getServerStatus(),
    listHighlightedForumThreads(5),
  ]);
  const banners = activeBanners.map((b) => ({
    id: b.id.toString(),
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
  }));

  return (
    <main className="container-site flex-1 py-6">
      {/* 版心固定 1140px 后栏宽不随视口放大,右栏对齐 lokta.cn 的 ~340px */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左栏:轮播 + 最近成就;轮播与右栏快捷入口等高(对齐 lokta.cn 497/798 比例);
         * gap-5 与右栏 space-y-5 同步,使两栏第二块(成就/状态卡)标题行水平对齐 */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="lg:h-[486px]">
            <HomeCarousel banners={banners} intervalMs={config.home.carouselIntervalSec * 1000} />
          </div>

          {/* 最近成就嵌入(US 首页配置):url 空=整块隐藏;高度/滚动条后台可配。
           * 与右栏卡片同壳(p-5 + mb-4 标题行),保证两栏标题基线对齐 */}
          {config.home.achievementUrl && (
            <section className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5">
              <SectionHeader
                title="最近成就事件"
                className="mb-4"
                meta={
                  <a
                    href={config.home.achievementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#6fb7e0]"
                  >
                    新窗口打开 ↗
                  </a>
                }
              />
              <div className="overflow-hidden rounded-xl bg-[#080d16]">
                <iframe
                  src={config.home.achievementUrl}
                  title="最近成就"
                  loading="lazy"
                  scrolling={config.home.achievementScrolling ? "auto" : "no"}
                  className="w-full border-0 bg-[#080d16]"
                  style={{ height: config.home.achievementHeight }}
                />
              </div>
            </section>
          )}
        </div>

        {/* 右栏:快捷入口 / 服务器状态 / 公告 / 商品 / 阶段 */}
        <div className="w-full space-y-5 lg:w-auto">
          {/* 快捷入口:对齐 lokta.cn 双行排版(金色组名独占一行,链接行在下) */}
          <section className="rounded-2xl border border-[#22385a] bg-[#13233a] px-5 py-5 lg:h-[486px]">
            <div className="flex h-full flex-col justify-between gap-2.5">
              {QUICK_LINKS.map((row) => (
                <div key={row.title}>
                  <p className="text-[15px] font-semibold leading-6 text-[#e8c877]">{row.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[13px] leading-6">
                    {row.links.map((l, i) => (
                      <span key={l.label} className="whitespace-nowrap">
                        {i > 0 && <span className="mx-1 text-[#3d5a80]">|</span>}
                        <Link href={l.href} className="text-[#d7c48d] hover:text-[#f4e3b0] hover:underline">
                          {l.label}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* enabled=false 时整卡隐藏(StatusCard 内部短路) */}
          <StatusCard initial={serverStatus} />

          <section className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5">
            <SectionHeader title="最新公告" moreHref="/announcements" />
            {announcements.length === 0 ? (
              <p className="text-sm text-[#6482a3]">暂无公告</p>
            ) : (
              <ul className="space-y-2.5 text-[15px]">
                {announcements.map((a) => (
                  <li key={a.slug} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="line-clamp-1 text-[#c7d5e6] hover:text-[#6fb7e0]"
                    >
                      {a.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[#6482a3]">
                      {a.publishedAt?.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5">
            <SectionHeader title="精选商品" moreHref="/shop" moreLabel="积分商店 →" />
            {featuredProducts.length === 0 ? (
              <p className="text-sm text-[#6482a3]">商品即将上架。</p>
            ) : (
              <HomeProductCarousel
                products={featuredProducts}
                intervalMs={config.home.carouselIntervalSec * 1000}
              />
            )}
          </section>

          <section className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5">
            <SectionHeader title="当前阶段" moreHref="/progression" moreLabel="渐进计划 →" />
            <p className="text-lg font-semibold text-[#e8c877]">
              {progression.current?.title ?? "待定"}
            </p>
            {progression.current?.phaseDate && (
              <p className="mt-1 text-xs text-[#6482a3]">
                开放于 {progression.current.phaseDate.toISOString().slice(0, 10)}
              </p>
            )}
            {progression.next && (
              <p className="mt-2 text-sm text-[#93b2ce]">
                下一阶段:{progression.next.title}
              </p>
            )}
          </section>

          {/* 论坛精华:填右侧留白(置顶优先,其次回复/浏览热度) */}
          <section className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5">
            <SectionHeader title="论坛精华" moreHref="/forum" moreLabel="玩家论坛 →" />
            {forumHighlights.length === 0 ? (
              <p className="text-sm text-[#6482a3]">论坛暂无主题。</p>
            ) : (
              <ul className="space-y-2.5 text-[15px]">
                {forumHighlights.map((t) => (
                  <li key={t.id.toString()} className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/forum/thread/${t.id}`}
                      className="line-clamp-1 text-[#c7d5e6] hover:text-[#6fb7e0]"
                    >
                      {t.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[#6482a3]">
                      {t.board.name} · 回复 {t.replyCount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SiteSidebar pageType="home" className="lg:w-auto" />
        </div>
      </div>
    </main>
  );
}
