import Link from "next/link";
import { DOWNLOAD_LINKS } from "@/constants/content";
import { SidebarCard } from "./card";

/** 客户端/登录器/插件下载卡(R9 静态事实;文件在教程页下载卡承载) */
export function ClientDownload() {
  return (
    <SidebarCard title="客户端下载" testId="sidebar-client-download">
      <Link
        href={DOWNLOAD_LINKS.client.href}
        className="block rounded bg-[#16233a] px-3 py-2 text-center text-xs text-[#c7d2e0] hover:bg-[#1c2c48] hover:text-[#e6d8a8]"
      >
        {DOWNLOAD_LINKS.client.label} · {DOWNLOAD_LINKS.client.note}
      </Link>
    </SidebarCard>
  );
}

export function LauncherDownload() {
  return (
    <SidebarCard title="登录器下载" testId="sidebar-launcher-download">
      <Link
        href={DOWNLOAD_LINKS.launcher.href}
        className="block rounded bg-[#16233a] px-3 py-2 text-center text-xs text-[#c7d2e0] hover:bg-[#1c2c48] hover:text-[#e6d8a8]"
      >
        {DOWNLOAD_LINKS.launcher.label} · {DOWNLOAD_LINKS.launcher.note}
      </Link>
    </SidebarCard>
  );
}

export function AddonDownload() {
  return (
    <SidebarCard title="插件下载" testId="sidebar-addon-download">
      <Link
        href={DOWNLOAD_LINKS.addon.href}
        className="block rounded bg-[#16233a] px-3 py-2 text-center text-xs text-[#c7d2e0] hover:bg-[#1c2c48] hover:text-[#e6d8a8]"
      >
        {DOWNLOAD_LINKS.addon.label} · {DOWNLOAD_LINKS.addon.note}
      </Link>
    </SidebarCard>
  );
}

export function YyChannel() {
  return (
    <SidebarCard title="YY 频道" testId="sidebar-yy-channel">
      <p className="text-xs text-[#8fa0b8]">{DOWNLOAD_LINKS.yy.note}</p>
    </SidebarCard>
  );
}
