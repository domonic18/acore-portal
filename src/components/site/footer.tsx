import Link from "next/link";
import { getConfig } from "@/lib/config";

/** 全站页脚(M3 US1 T018,FR-204;2026-10 设计稿对齐):居中链接 + 版权行;备案号与 QQ 群后台可配,留空不渲染 */
export async function SiteFooter() {
  const { site } = await getConfig();
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
          {site.qqGroup && <span>QQ 群:{site.qqGroup}</span>}
        </div>
        <p>
          © {new Date().getFullYear()} 老克塔 LoktaCN · 怀旧公益项目(非营利) ·
          Powered by AzerothCore
          {site.icp && (
            <>
              {" · "}
              <a
                href="https://beian.miit.gov.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#e8c877]"
              >
                {site.icp}
              </a>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
