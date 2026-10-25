import { requireAdmin } from "@/server/session-guard";
import { getDashboard } from "@/server/services/stats/dashboard";
import { StatsRefresh } from "@/components/admin/stats-refresh";

/**
 * 统计看板(US4 T027,FR-313/SC-306,quickstart S4):五区块+手动刷新;
 * Umami 区块独立容错(未配置/失败→「暂不可用」,不拖垮整页)。
 */
export const dynamic = "force-dynamic";

function Block({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testid}
      className="flex flex-col gap-2 rounded border border-gray-800 p-4 text-sm"
    >
      <h2 className="font-semibold text-gray-200">{title}</h2>
      {children}
    </section>
  );
}

export default async function AdminStatsPage() {
  await requireAdmin();
  const data = await getDashboard();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">统计看板</h1>
        <StatsRefresh />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Block title="今日在线" testid="stats-online">
          <p className="text-gray-400">
            当前在线{" "}
            <span className="text-lg font-bold text-gray-100">
              {data.online.current}
            </span>
            {data.online.source === "degraded" && (
              <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300">
                数据延迟
              </span>
            )}
          </p>
        </Block>

        <Block title="文章阅读 Top 10" testid="stats-article-top">
          {data.articleTop.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <ol className="flex flex-col gap-1 text-gray-400">
              {data.articleTop.map((a, i) => (
                <li key={a.slug} className="flex items-center gap-2">
                  <span className="w-5 text-right text-gray-600">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-gray-300">
                    {a.title}
                  </span>
                  <span>{a.views}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="404 路径 Top 10(近 7 日)" testid="stats-notfound-top">
          {data.notFoundTop.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <ol className="flex flex-col gap-1 text-gray-400">
              {data.notFoundTop.map((n) => (
                <li key={n.path} className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-gray-300">
                    {n.path}
                  </code>
                  <span>{n.count}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="近 7 天交易与注册" testid="stats-trade">
          <dl className="grid grid-cols-3 gap-2 text-gray-400">
            <div>
              <dt>订单数</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.orders7d.count}
              </dd>
            </div>
            <div>
              <dt>积分消耗</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.orders7d.pointsSpent}
              </dd>
            </div>
            <div>
              <dt>新注册</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.users7d.newRegistered}
              </dd>
            </div>
          </dl>
        </Block>

        <Block title="Umami 流量(24h)" testid="stats-umami">
          {!data.umami.configured ? (
            <p className="text-gray-500">未接入 Umami(配置 umami 组后生效)。</p>
          ) : !data.umami.ok ? (
            <p className="text-gray-500" data-testid="stats-umami-error">
              Umami 暂不可用。
            </p>
          ) : (
            <div className="flex flex-col gap-2 text-gray-400">
              <p>
                PV{" "}
                <span className="text-lg font-bold text-gray-100">
                  {data.umami.pv24h}
                </span>
                <span className="ml-4">
                  UV{" "}
                  <span className="text-lg font-bold text-gray-100">
                    {data.umami.uv24h}
                  </span>
                </span>
              </p>
              {data.umami.topReferrers.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {data.umami.topReferrers.map((r) => (
                    <li key={r.domain} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-gray-300">
                        {r.domain}
                      </span>
                      <span>{r.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Block>
      </div>
    </div>
  );
}
