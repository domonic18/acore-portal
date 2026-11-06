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
          <p className="text-5xl font-bold text-highlight-soft">404</p>
          <h1 className="text-lg text-foreground">页面不存在或已迁移</h1>
          <p className="max-w-md text-sm text-muted">
            你访问的地址在老克塔没有对应内容;旧站链接如未自动跳转,可从首页重新进入。
          </p>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="rounded border border-line-muted px-4 py-2 text-foreground hover:border-highlight-deep hover:text-highlight-soft"
            >
              返回首页
            </Link>
            <Link
              href="/shop"
              className="rounded bg-highlight-deep px-4 py-2 font-medium text-ink-warm hover:bg-highlight-deep-hover"
            >
              前往积分商店
            </Link>
          </div>
        </ContentPanel>
      </main>
    </>
  );
}
