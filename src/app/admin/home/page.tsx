import { getConfig } from "@/lib/config";
import { listAllBanners } from "@/server/services/home/banners";
import { listFeaturedCandidates, listFeaturedForAdmin } from "@/server/services/home/featured";
import { BannerManager } from "@/components/admin/banner-manager";
import { CarouselSettingsForm } from "@/components/admin/carousel-settings-form";
import { AchievementEmbedForm } from "@/components/admin/achievement-embed-form";
import { FeaturedManager } from "@/components/admin/featured-manager";

/** 首页配置:轮播物料管理+轮播间隔 + 精选商品管理 + 最近成就 iframe 嵌入(地址/滚动条) */
export default async function AdminHomePage() {
  const [banners, config, featured, candidates] = await Promise.all([
    listAllBanners(),
    getConfig(),
    listFeaturedForAdmin(),
    listFeaturedCandidates(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">首页配置</h1>
      <BannerManager banners={banners} />
      <hr className="border-[#22385a]" />
      <FeaturedManager products={featured} candidates={candidates} />
      <hr className="border-[#22385a]" />
      <CarouselSettingsForm initial={{ carouselIntervalSec: config.home.carouselIntervalSec }} />
      <hr className="border-[#22385a]" />
      <AchievementEmbedForm
        rankBase={config.tools.rankBase}
        initial={{
          achievementUrl: config.home.achievementUrl,
          achievementScrolling: config.home.achievementScrolling,
        }}
      />
    </div>
  );
}
