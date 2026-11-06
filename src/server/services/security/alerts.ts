import "server-only";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { setLockIfAbsent } from "@/lib/redis/rate-limit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { NOTIFICATION_TYPE } from "@/constants/notification";
import {
  SECURITY_ALERT_DEDUP_SEC,
  SECURITY_ALERT_KIND,
  securityAlertKey,
} from "@/constants/security";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * 安全告警(2026-11-06 撞库加固 PR-J,F11):
 * 前面每一批加固都设了阈值,但阈值若**不可执行**就等于没设——
 * audit_log 此前只写不读,没人知道越阈了。
 *
 * 这里把阈值变成可见信号:越阈即落一条 SECURITY_ALERT 审计,
 * 并给管理员发站内信。**去重走 Redis NX**(同一 kind+对象在窗口内只发一次),
 * 否则持续攻击会把管理员的收件箱刷爆。
 *
 * 触发时机:后台安全看板加载时评估(读时评估)——
 * 登录热路径上不做额外聚合,撞库流量大时那才是最不该加负担的地方。
 */

export type SecurityAlert = {
  kind: string;
  /** 告警对象:来源 IP 或被锁账号名 */
  subject: string;
  /** 人类可读摘要(站内信正文) */
  summary: string;
  count: number;
};

export type AlertEvaluation = {
  /** 本轮评估的候选数(越阈的 IP + 被锁账号) */
  evaluated: number;
  /** 本轮真正发出的告警(去重后) */
  raised: SecurityAlert[];
};

/**
 * 抢告警去重锁。
 *
 * Redis 不可用时返回 "unavailable":此时**只落审计行、不发站内信**——
 * 站内信发爆比漏发一次告警更糟(收件箱刷屏等于告警失效)。
 */
async function acquireAlertLock(key: string): Promise<boolean | "unavailable"> {
  try {
    return await setLockIfAbsent(key, SECURITY_ALERT_DEDUP_SEC);
  } catch {
    return "unavailable";
  }
}

/** 给全部管理员发站内信(无管理员则静默跳过——审计行仍在) */
async function notifyAdmins(title: string, body: string): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });
  if (admins.length === 0) return 0;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: NOTIFICATION_TYPE.SECURITY,
      title,
      body,
      linkUrl: "/admin/security",
    })),
  });
  return admins.length;
}

/** 窗口内失败数越阈的来源 IP */
async function queryBurstIps(
  since: Date,
  threshold: number,
): Promise<{ ip: string; fails: number }[]> {
  const rows = await prisma.$queryRaw<{ ip: string; fails: bigint | number }[]>`
    SELECT COALESCE(\`ip\`, 'unknown') AS ip, COUNT(*) AS fails
    FROM \`audit_log\`
    WHERE \`category\` = 'security'
      AND \`action\` IN ('login_failed', 'login_failed_unknown')
      AND \`created_at\` >= ${since}
    GROUP BY COALESCE(\`ip\`, 'unknown')
    HAVING COUNT(*) >= ${threshold}
    ORDER BY fails DESC
    LIMIT 50
  `;
  return rows.map((r) => ({ ip: r.ip, fails: Number(r.fails) }));
}

/** 窗口内被锁的账号(取锁定事件里的用户名,去重) */
async function queryLockedUsernames(since: Date): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_LOCKED,
      createdAt: { gte: since },
    },
    orderBy: { id: "desc" },
    take: 200,
    select: { payloadJson: true },
  });
  const seen = new Set<string>();
  for (const r of rows) {
    const payload = (r.payloadJson ?? {}) as Record<string, unknown>;
    if (typeof payload.username === "string") seen.add(payload.username);
  }
  return [...seen];
}

/**
 * 阈值评估 + 告警发出。
 *
 * 阈值复用登录域既有配置(`security.loginIpSoftFails` / `security.loginWindowSec`):
 * 看板与告警说的是同一件事,不必再开一套第二口径。
 */
export async function evaluateSecurityAlerts(): Promise<AlertEvaluation> {
  const { security } = await getConfig();
  const threshold = Math.max(1, security.loginIpSoftFails);
  const windowSec = Math.max(1, security.loginWindowSec);
  const since = new Date(Date.now() - windowSec * 1000);

  const [burstIps, lockedUsernames] = await Promise.all([
    queryBurstIps(since, threshold),
    queryLockedUsernames(since),
  ]);

  const raised: SecurityAlert[] = [];

  for (const burst of burstIps) {
    const lock = await acquireAlertLock(
      securityAlertKey(SECURITY_ALERT_KIND.IP_FAILURE_BURST, burst.ip),
    );
    if (lock === false) continue;
    const summary = `来源 ${burst.ip} 在 ${windowSec} 秒内登录失败 ${burst.fails} 次(阈值 ${threshold})`;
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.SECURITY_ALERT,
      ip: burst.ip === "unknown" ? null : burst.ip,
      payload: {
        kind: SECURITY_ALERT_KIND.IP_FAILURE_BURST,
        ip: burst.ip,
        fails: burst.fails,
        threshold,
        windowSec,
      },
    });
    if (lock === true) {
      await notifyAdmins("撞库嫌疑:单 IP 失败数越阈", summary);
    }
    raised.push({
      kind: SECURITY_ALERT_KIND.IP_FAILURE_BURST,
      subject: burst.ip,
      summary,
      count: burst.fails,
    });
  }

  for (const username of lockedUsernames) {
    const lock = await acquireAlertLock(
      securityAlertKey(SECURITY_ALERT_KIND.ACCOUNT_LOCKED, username),
    );
    if (lock === false) continue;
    const summary = `账号 ${username} 因连续登录失败被锁定`;
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.SECURITY_ALERT,
      payload: {
        kind: SECURITY_ALERT_KIND.ACCOUNT_LOCKED,
        username,
        windowSec,
      },
    });
    if (lock === true) {
      await notifyAdmins("账号被锁定", summary);
    }
    raised.push({
      kind: SECURITY_ALERT_KIND.ACCOUNT_LOCKED,
      subject: username,
      summary,
      count: 1,
    });
  }

  return { evaluated: burstIps.length + lockedUsernames.length, raised };
}
