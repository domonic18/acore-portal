import { getConfig } from "@/lib/config";
import { listAllBanners } from "@/server/services/home/banners";
import { BannerManager } from "@/components/admin/banner-manager";
import { CarouselSettingsForm } from "@/components/admin/carousel-settings-form";
import { AchievementEmbedForm } from "@/components/admin/achievement-embed-form";

/** 首页配置:轮播物料管理+轮播间隔 + 最近成就 iframe 嵌入三参数 */
export default async function AdminHomePage() {
  const [banners, config] = await Promise.all([listAllBanners(), getConfig()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">首页配置</h1>
      <BannerManager banners={banners} />
      <hr className="border-gray-800" />
      <CarouselSettingsForm initial={{ carouselIntervalSec: config.home.carouselIntervalSec }} />
      <hr className="border-gray-800" />
      <AchievementEmbedForm
        initial={{
          achievementUrl: config.home.achievementUrl,
          achievementHeight: config.home.achievementHeight,
          achievementScrolling: config.home.achievementScrolling,
        }}
      />
    </div>
  );
}
