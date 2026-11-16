import { PAGE_VIEW_ONLINE_WINDOW_SECONDS } from "@/constants/page-view";
import { formatTime } from "@/lib/format";
import { splitSiteUrl, decodeUrlForDisplay } from "@/lib/url-path";
import { Panel, SubTitle } from "./parts";

/**
 * 实时面板(2026-11-17 新增,经用户确认的展示口径):
 * 网站在线(5 分钟滑窗,登录按账号去重、游客按 IP 去重)与最近访问(最新 N 条埋点)。
 * 原始 IP 与账号仅供后台看板展示,埋点数据受 90 天惰性清理约束。
 */

/** 页面单元格:解析出的标题为主行,小号路径为次行(与热门页面同一可读性口径) */
function PageCell({ path }: { path: string }) {
  const { origin, path: sitePath } = splitSiteUrl(path);
  const display = decodeUrlForDisplay(origin ? sitePath : path);
  return (
    <div className="min-w-0">
      <code
        className="block truncate font-mono text-[12.5px] text-[#dcebf7]"
        title={path}
      >
        {origin && <span className="text-[#4f6a8a]">{origin}</span>}
        {display || "/"}
      </code>
    </div>
  );
}

/** 账号单元格:登录账号亮显,游客灰显 */
function AccountCell({ username }: { username: string | null }) {
  if (!username) {
    return <span className="text-[12.5px] text-[#4f6a8a]">游客</span>;
  }
  return <span className="truncate text-[12.5px] text-[#c4d9ec]">{username}</span>;
}

/** IP 单元格:缺失时灰显占位 */
function IpCell({ ip }: { ip: string | null }) {
  if (!ip) {
    return <span className="text-[12px] text-[#4f6a8a]">—</span>;
  }
  return <span className="font-mono text-[12px] text-[#93b2ce]">{ip}</span>;
}

/** 网站在线:5 分钟滑窗内的访客(登录按账号去重、游客按 IP 去重) */
export function StatsOnlinePanel({
  online,
  className,
}: {
  online: {
    total: number;
    userCount: number;
    guestCount: number;
    rows: { username: string | null; path: string; ip: string | null; isUser: boolean }[];
  };
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="网站在线"
      testid="stats-online"
      hint={`近 ${PAGE_VIEW_ONLINE_WINDOW_SECONDS / 60} 分钟内有页面访问的访客;登录用户按账号去重,游客按 IP 去重,同一账号多端只计一次。`}
    >
      {online.total === 0 ? (
        <p className="text-[13px] text-[#6482a3]">当前没有在线访客。</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-[26px] font-semibold leading-none text-[#6fb7e0]"
              data-testid="stats-online-count"
            >
              {online.total}
            </span>
            <span className="text-[12.5px] text-[#6482a3]">人在线</span>
            <span className="ml-auto text-[11.5px] text-[#6482a3]">
              账号 {online.userCount} · 游客 {online.guestCount}
            </span>
          </div>
          <ul className="flex flex-col">
            {online.rows.map((r, i) => (
              <li
                key={`${r.isUser ? r.username ?? `u${i}` : r.ip ?? `g${i}`}-${r.path}-${i}`}
                className="flex items-center gap-2.5 border-t border-[#1d3252]/60 py-1.5 first:border-t-0"
              >
                <span className="min-w-0 flex-[3]">
                  <PageCell path={r.path} />
                </span>
                <span className="min-w-0 flex-[2] truncate">
                  <AccountCell username={r.username} />
                </span>
                <span className="w-[120px] shrink-0 truncate text-right">
                  <IpCell ip={r.ip} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** 最近访问:最新 N 条页面访问埋点(时间 / 页面 / 账号 / IP) */
export function StatsRecentVisitsPanel({
  recent,
  className,
}: {
  recent: { createdAt: Date; path: string; ip: string | null; username: string | null }[];
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="最近访问"
      testid="stats-recent-visits"
      hint="自建埋点的最新页面访问;IP 与账号仅供后台看板展示,埋点数据保留 90 天。"
    >
      {recent.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无访问记录。</p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((r, i) => (
            <li
              key={`${r.createdAt.getTime()}-${r.path}-${i}`}
              className="flex items-center gap-2.5 border-t border-[#1d3252]/60 py-1.5 first:border-t-0"
            >
              <span className="w-[70px] shrink-0 font-mono text-[12px] text-[#6482a3]">
                {formatTime(r.createdAt)}
              </span>
              <span className="min-w-0 flex-[3]">
                <PageCell path={r.path} />
              </span>
              <span className="min-w-0 flex-[2] truncate">
                <AccountCell username={r.username} />
              </span>
              <span className="w-[120px] shrink-0 truncate text-right">
                <IpCell ip={r.ip} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
