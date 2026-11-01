import Link from "next/link";
import { ContentPanel } from "@/components/site/content-panel";
import { NotFoundBeacon } from "@/components/site/not-found-beacon";

/**
 * 全局 404(US4 T025,FR-312):站点暗色样式 + client beacon 上报路径
 * (Redis stats:404:{yyyyMMdd},看板 404 区块数据源)。
 * 内容区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
 */
export default function NotFound() {
  return (
    <>
      <NotFoundBeacon />
      <main className="container-site flex flex-1 items-center justify-center py-10">
        <ContentPanel className="flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center">
          <p className="text-5xl font-bold text-[#e6d8a8]">404</p>
          <h1 className="text-lg text-[#c7d2e0]">页面不存在或已迁移</h1>
          <p className="max-w-md text-sm text-[#8fa0b8]">
            你访问的地址在老克塔没有对应内容;旧站链接如未自动跳转,可从首页重新进入。
          </p>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="rounded border border-[#243350] px-4 py-2 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
            >
              返回首页
            </Link>
            <Link
              href="/shop"
              className="rounded bg-[#c9a227] px-4 py-2 font-medium text-[#1a1408] hover:bg-[#dbb535]"
            >
              前往积分商店
            </Link>
          </div>
        </ContentPanel>
      </main>
    </>
  );
}
