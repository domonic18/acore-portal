import Link from "next/link";

/** 全站页脚(M3 US1 T018,FR-204):协议/公约/备案 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-[#1e2a3d] bg-[#0a1220]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-xs text-[#8fa0b8]">
        <div className="flex items-center gap-4">
          <Link href="/agreement" className="hover:text-[#e6d8a8]">
            用户协议
          </Link>
          <Link href="/forum" className="hover:text-[#e6d8a8]">
            论坛公约
          </Link>
          <Link href="/about" className="hover:text-[#e6d8a8]">
            项目简介
          </Link>
          <Link href="/sitemap" className="hover:text-[#e6d8a8]">
            网站地图
          </Link>
        </div>
        <p>老克塔 · AzerothCore 怀旧社区 · 怀旧公益项目(非营利)</p>
      </div>
    </footer>
  );
}
