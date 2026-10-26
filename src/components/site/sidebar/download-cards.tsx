import Link from "next/link";
import { getConfig } from "@/lib/config";
import { SidebarCard } from "./card";

/**
 * 客户端/登录器/插件/YY 侧栏卡(R9):链接与文案后台可配(settings download 组)。
 * url 空=对应卡片隐藏;YY 卡无链接只显文案,文案空=隐藏。
 */
function DownloadLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <Link
      href={href}
      className="block rounded bg-[#16233a] px-3 py-2 text-center text-xs text-[#c7d2e0] hover:bg-[#1c2c48] hover:text-[#e6d8a8]"
    >
      {note ? `${label} · ${note}` : label}
    </Link>
  );
}

export async function ClientDownload() {
  const d = (await getConfig()).download;
  if (!d.clientUrl) return null;
  return (
    <SidebarCard title="客户端下载" testId="sidebar-client-download">
      <DownloadLink href={d.clientUrl} label="客户端下载" note={d.clientNote} />
    </SidebarCard>
  );
}

export async function LauncherDownload() {
  const d = (await getConfig()).download;
  if (!d.launcherUrl) return null;
  return (
    <SidebarCard title="登录器下载" testId="sidebar-launcher-download">
      <DownloadLink href={d.launcherUrl} label="登录器下载" note={d.launcherNote} />
    </SidebarCard>
  );
}

export async function AddonDownload() {
  const d = (await getConfig()).download;
  if (!d.addonUrl) return null;
  return (
    <SidebarCard title="插件下载" testId="sidebar-addon-download">
      <DownloadLink href={d.addonUrl} label="插件下载" note={d.addonNote} />
    </SidebarCard>
  );
}

export async function YyChannel() {
  const d = (await getConfig()).download;
  if (!d.yyNote) return null;
  return (
    <SidebarCard title="YY 频道" testId="sidebar-yy-channel">
      <p className="text-xs text-[#8fa0b8]">{d.yyNote}</p>
    </SidebarCard>
  );
}
