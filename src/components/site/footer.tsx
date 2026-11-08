import Link from "next/link";
import { APP_SHA, BUILD_TIME, formatBuildInfo } from "@/constants/version";

/**
 * 全站页脚(M3 US1 T018,FR-204;2026-10 设计稿对齐):居中链接 + 版权行;
 * 备案号与英文版权声明后台可配,留空不渲染。
 * 纯展示组件:备案号/版权文案由页面层经 getSiteFooterView() 取数后传入(组件无 IO,issue #85)。
 * 构建信息(构建时间 + 提交短号)取自构建期内联的常量,非运行期 env——
 * 值与镜像产物绑定,用于人工核对线上是不是最新版本。
 */
export function SiteFooter({
  icp,
  copyrightEn,
}: {
  icp: string | null;
  copyrightEn: string | null;
}) {
  // 本地手工构建无构建信息(常量为空)→ 整行不渲染
  const buildInfo = formatBuildInfo(BUILD_TIME, APP_SHA);

  return (
    <footer className="mt-12 border-t border-line bg-footer">
      <div className="container-site flex flex-col items-center gap-2.5 px-4 py-7 text-[13px] text-muted">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/agreement" className="hover:text-highlight">
            用户协议
          </Link>
          <Link href="/post/网站规范" className="hover:text-highlight">
            规范要求
          </Link>
          <Link href="/about" className="hover:text-highlight">
            项目简介
          </Link>
          <Link href="/tutorial" className="hover:text-highlight">
            使用教程
          </Link>
          <Link href="/sitemap" className="hover:text-highlight">
            网站地图
          </Link>
        </div>
        <p>
          © {new Date().getFullYear()} 老克塔 LoktaCN · 怀旧公益项目(非营利)
          {icp && (
            <>
              {" · "}
              <a
                href="https://beian.miit.gov.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-highlight"
              >
                {icp}
              </a>
            </>
          )}
        </p>
        {copyrightEn && (
          <p className="max-w-3xl whitespace-pre-line text-center text-[11px] leading-5 text-muted">
            {copyrightEn}
          </p>
        )}
        {buildInfo && (
          <p className="text-[11px] leading-5 text-muted">{buildInfo}</p>
        )}
      </div>
    </footer>
  );
}
