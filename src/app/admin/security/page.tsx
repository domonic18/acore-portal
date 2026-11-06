import Link from "next/link";
import { AlertTriangle, Lock, ShieldAlert, UserCheck } from "lucide-react";
import { requireAdmin } from "@/server/session-guard";
import { getSecurityDashboardView } from "@/server/services/security/audit-view";
import { evaluateSecurityAlerts } from "@/server/services/security/alerts";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import {
  SecurityLockedAccounts,
  SecurityRecentAudit,
  SecurityTopOffenders,
} from "@/components/admin/security";

/**
 * 后台安全看板(2026-11-06 撞库加固 PR-J,F11):
 * audit_log 此前**只写不读**——撞库既无法界定受害账号,也无法复盘,
 * 前面每一批加固设的阈值因此都「不可执行」。本页把审计流水读成可判读的信号:
 * 嫌疑来源 IP(失败数 + 命中账号数)、被锁账号、近期审计流水。
 *
 * 告警在**读时评估**:看板加载即按阈值评估一次并去重发出(Redis NX),
 * 登录热路径上不做额外聚合——撞库流量大时那才是最不该加负担的地方。
 */
export const dynamic = "force-dynamic";

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: { cursors?: string };
}) {
  await requireAdmin();
  // 游标链:第 N 页用第 N-1 个游标,链本身串在 URL 里以便回退
  const cursors = (searchParams.cursors ?? "").split(",").filter(Boolean);
  const cursor = cursors.at(-1) ?? null;

  const alerts = await evaluateSecurityAlerts();
  const view = await getSecurityDashboardView({
    cursor: cursor ? BigInt(cursor) : null,
  });

  const nextHref = view.recent.nextCursor
    ? `/admin/security?cursors=${[...cursors, view.recent.nextCursor.toString()].join(",")}`
    : null;
  const prevHref =
    cursors.length > 0
      ? `/admin/security?cursors=${cursors.slice(0, -1).join(",")}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">安全看板</h1>
        <p className="text-xs text-[#6482a3]">
          统计窗口 {view.windowHours} 小时 · 生成于{" "}
          {new Date(view.generatedAt).toLocaleString("zh-CN")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          icon={<AlertTriangle />}
          value={view.totals.failed}
          label="登录失败次数"
          tone={view.totals.failed > 0 ? "warn" : "accent"}
        />
        <StatCard
          icon={<ShieldAlert />}
          value={view.totals.offenderIps}
          label="失败数越阈来源 IP"
          tone={view.totals.offenderIps > 0 ? "danger" : "accent"}
        />
        <StatCard
          icon={<Lock />}
          value={view.totals.lockedAccounts}
          label="被锁账号"
          tone={view.totals.lockedAccounts > 0 ? "danger" : "accent"}
        />
        <StatCard
          icon={<UserCheck />}
          value={view.totals.succeeded}
          label="登录成功次数"
          tone="ok"
        />
      </div>

      {alerts.raised.length > 0 && (
        <Card className="border-[#eda9a9]/40">
          <CardHeader title={`本次新增告警 ${alerts.raised.length} 条`} />
          <CardBody>
            <ul className="flex flex-col gap-1 text-sm text-[#dcebf7]">
              {alerts.raised.map((a) => (
                <li key={`${a.kind}:${a.subject}`}>{a.summary}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="嫌疑来源 IP" />
        <CardBody>
          <SecurityTopOffenders offenders={view.offenders} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="被锁账号" />
        <CardBody>
          <SecurityLockedAccounts accounts={view.lockedAccounts} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="近期安全审计"
          actions={
            <div className="flex items-center gap-3 text-sm">
              {prevHref && (
                <Link
                  href={prevHref}
                  className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
                >
                  较新
                </Link>
              )}
              {nextHref && (
                <Link
                  href={nextHref}
                  className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
                >
                  更早
                </Link>
              )}
            </div>
          }
        />
        <CardBody>
          <SecurityRecentAudit rows={view.recent.items} />
        </CardBody>
      </Card>
    </div>
  );
}
