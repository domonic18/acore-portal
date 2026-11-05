import Link from "next/link";
import { getHomeBlocks } from "@/server/services/home/home";
import { listActiveBanners } from "@/server/services/home/banners";
import { getServerStatus } from "@/server/services/status/status";
import { listHighlightedForumThreads } from "@/server/services/forum/browse";
import { getConfig } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { TUTORIAL_ANCHORS } from "@/constants/content";
import { StatusCard } from "@/components/site/status-card";
import { AchievementEmbed } from "@/components/site/achievement-embed";
import { HomeCarousel } from "@/components/site/home-carousel";
import { HomeProductCarousel } from "@/components/site/home-product-carousel";
import { SectionHeader } from "@/components/site/section-header";
import { SiteSidebar } from "@/components/site/sidebar/site-sidebar";
import { getSidebarView } from "@/server/services/sidebar/view";

/**
 * 首页(2026-10 与 ardot 设计稿 p01 对齐):左栏=轮播+最近成就嵌入;
 * 右栏=快捷入口/服务器状态(含当前阶段)/最新公告 5/精选商品(featured 优先回退最新上架),
 * 尾部接侧栏(home 类型仅 QQ 群卡;积分显示在页头头像下拉,2026-11-05 收敛)。
 * 轮播空物料整块隐藏,成就 iframe url 空=隐藏;/admin 改动即时生效。
 */

/**
 * 快捷入口(设计稿 qlinks 六行,对齐生产原站链接):下载项走教程页锚点,
 * 高清端/解压/登录问题/补丁生效已升格为静态页(硬核模式同),插件教程仍落文章详情页。
 */
const QUICK_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "项目简介",
    links: [
      { label: "注册方法", href: "/tutorial" },
      { label: "渐进计划", href: "/progression" },
      { label: "硬核模式", href: "/hardcore-mode" },
      { label: "规范要求", href: "/post/网站规范" },
    ],
  },
  {
    title: "客户端",
    links: [
      { label: "普清端", href: `/tutorial#${TUTORIAL_ANCHORS.client}` },
      { label: "高清端", href: "/hd-client" },
      { label: "解压方法", href: "/client-extract" },
    ],
  },
  {
    title: "登录器",
    links: [
      { label: "下载", href: `/tutorial#${TUTORIAL_ANCHORS.launcher}` },
      { label: "常见登录问题", href: "/login-troubleshoot" },
    ],
  },
  {
    title: "补丁",
    links: [
      { label: "下载", href: `/tutorial#${TUTORIAL_ANCHORS.patch}` },
      { label: "补丁生效方法", href: "/patch-guide" },
    ],
  },
  {
    title: "插件",
    links: [
      { label: "魔盒插件教程", href: "/post/【教程】魔盒插件的下载使用方法" },
      { label: "黑盒插件教程", href: "/post/【插件使用】黑盒工坊的使用方法教程" },
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
  const [{ announcements, featuredProducts }, activeBanners, config, serverStatus, forumHighlights, sidebar] =
    await Promise.all([
    getHomeBlocks(),
    listActiveBanners(),
    getConfig(),
    getServerStatus(),
    listHighlightedForumThreads(5),
    getSidebarView("home"),
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
        {/* 轮播 / 快捷入口为两栏首屏同行(lg:h-[486px]);移动端 DOM 顺序
         * = 轮播 → 快捷入口 → 最近成就 → 其余卡片,快捷入口不再被成就块挤走 */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:h-[486px]">
          <HomeCarousel banners={banners} intervalMs={config.home.carouselIntervalSec * 1000} />
        </div>

        {/* 右栏首屏:快捷入口(对齐 lokta.cn 双行排版:金色组名独占一行,链接行在下) */}
        <section className="w-full rounded-2xl border border-[#22385a] bg-[#13233a] px-5 py-5 lg:col-start-2 lg:row-start-1 lg:h-[486px]">
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

        {/* 最近成就嵌入(US 首页配置):url 空=整块隐藏;高度/滚动条后台可配。
         * 高度在组件内再受 68vh 约束,存量 185vh 配置不再撑爆首屏 */}
        {config.home.achievementUrl && (
          <section className="min-w-0 rounded-2xl border border-[#22385a] bg-[#13233a] p-5 lg:col-start-1 lg:row-start-2">
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
            <AchievementEmbed
              url={config.home.achievementUrl}
              height={config.home.achievementHeight}
              scrolling={config.home.achievementScrolling}
            />
          </section>
        )}

        {/* 右栏其余卡片 */}
        <div className="w-full space-y-5 lg:col-start-2 lg:row-start-2 lg:w-auto">
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
                      {a.publishedAt && formatDate(a.publishedAt)}
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

          {/* 当前阶段独立区块已下线(#64):服务器状态卡内含当前阶段 chip 且可点直达渐进锚点,双份冗余 */}

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

          <SiteSidebar pageType="home" {...sidebar} className="lg:w-auto" />
        </div>
      </div>
    </main>
  );
}
