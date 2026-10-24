import { SiteSidebar } from "@/app/_components/sidebar/sidebar";

/**
 * 首页壳(M3 US1;US3 T022 四区块聚合:公告/服务器状态/当前渐进阶段/精选商品)。
 * 侧栏按 home 类型渲染(FR-206)。
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="text-3xl font-bold text-[#e6d8a8]">
          老克塔 · AzerothCore 怀旧社区
        </h1>
        <p className="text-[#8fa0b8]">怀旧公益项目 · 60 时代经典旧世</p>
        <div className="flex gap-4">
          <a
            href="/shop"
            className="rounded bg-[#c9a227] px-4 py-2 font-medium text-[#1a1408] hover:bg-[#dbb535]"
          >
            积分商店
          </a>
          <a
            href="/tutorial"
            className="rounded border border-[#243350] px-4 py-2 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
          >
            新手教程
          </a>
        </div>
      </div>
      <SiteSidebar pageType="home" />
    </main>
  );
}
