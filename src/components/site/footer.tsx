import Link from "next/link";

/**
 * 全站页脚(M3 US1 T018,FR-204;2026-10 设计稿对齐):居中链接 + 版权行;
 * 备案号与英文版权声明后台可配,留空不渲染。
 * 纯展示组件:备案号/版权文案由页面层经 getSiteFooterView() 取数后传入(组件无 IO,issue #85)。
 */
export function SiteFooter({
  icp,
  copyrightEn,
}: {
  icp: string | null;
  copyrightEn: string | null;
}) {
  return (
    <footer className="mt-12 border-t border-[#22385a] bg-[#0c1626]">
      <div className="container-site flex flex-col items-center gap-2.5 px-4 py-7 text-[13px] text-[#6482a3]">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/agreement" className="hover:text-[#e8c877]">
            用户协议
          </Link>
          <Link href="/convention" className="hover:text-[#e8c877]">
            论坛公约
          </Link>
          <Link href="/about" className="hover:text-[#e8c877]">
            项目简介
          </Link>
          <Link href="/tutorial" className="hover:text-[#e8c877]">
            使用教程
          </Link>
          <Link href="/sitemap" className="hover:text-[#e8c877]">
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
                className="hover:text-[#e8c877]"
              >
                {icp}
              </a>
            </>
          )}
        </p>
        {copyrightEn && (
          <p className="max-w-3xl whitespace-pre-line text-center text-[11px] leading-5 text-[#4d6a8c]">
            {copyrightEn}
          </p>
        )}
      </div>
    </footer>
  );
}
