import "server-only";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getTransporter, renderMail } from "@/lib/mail";
import type { MailPayload, MailTemplateValue } from "@/lib/mail";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import {
  MAIL_RESEND_DAILY_MAX,
  MAIL_RESEND_MIN_INTERVAL_SEC,
} from "@/constants/mail";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import type { Prisma } from "@/generated/business";

/**
 * 事务邮件 outbox(research R7,宪法 II):
 * 入库先行(注册事务内 enqueue)→ 异步 drain 发送;
 * 失败可见(status=failed + attempts + last_error)且可重发,禁止静默丢失。
 */
export type EnqueueMailInput = {
  to: string;
  template: MailTemplateValue;
  payload: MailPayload;
  relatedUserId?: bigint | null;
};

/** 在调用方事务内入库(与业务原子);发送随后异步进行 */
export function enqueueMail(
  tx: Prisma.TransactionClient,
  input: EnqueueMailInput,
) {
  return tx.mailOutbox.create({
    data: {
      toEmail: input.to,
      template: input.template,
      payloadJson: input.payload as object,
      relatedUserId: input.relatedUserId ?? null,
    },
  });
}

let draining = false;

/** drain 当前 pending 邮件(路由里 fire-and-forget 调用;失败落库不抛出) */
export async function drainOutbox(limit = 10): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const pending = await prisma.mailOutbox.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    for (const mail of pending) {
      try {
        const rendered = renderMail(
          mail.template as MailTemplateValue,
          mail.payloadJson as unknown as MailPayload,
        );
        const transporter = await getTransporter();
        const { smtp } = await getConfig();
        await transporter.sendMail({
          from: smtp.from,
          to: mail.toEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        await prisma.mailOutbox.update({
          where: { id: mail.id },
          data: { status: "sent", sentAt: new Date() },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.mailOutbox.update({
          where: { id: mail.id },
          data: {
            status: "failed",
            attempts: { increment: 1 },
            lastError: message.slice(0, 500),
          },
        });
        // 审计只记事件标识,不记邮件内容/链接(宪法 VI)
        await writeAudit({
          category: AUDIT_CATEGORY.MAIL,
          action: AUDIT_ACTION.MAIL_SEND_FAILED,
          actorUserId: mail.relatedUserId,
          payload: { mailId: mail.id.toString(), template: mail.template },
        });
      }
    }
  } finally {
    draining = false;
  }
}

/** 请求后异步触发(不阻塞响应) */
export function scheduleDrain(): void {
  setTimeout(() => {
    void drainOutbox().catch(() => undefined);
  }, 50);
}

export type ResendGate = { ok: true } | { ok: false; retryAfterSec: number };

/** 重发限速(FR-010):同用户同模板 ≥60s 间隔、≤5 次/天 */
export async function checkResendRate(
  userId: string,
  template: string,
): Promise<ResendGate> {
  const minute = await hitRateLimit(
    `rl:mail:${template}:${userId}:60s`,
    { windowSec: MAIL_RESEND_MIN_INTERVAL_SEC, max: 1 },
  );
  if (!minute.allowed) {
    return { ok: false, retryAfterSec: minute.retryAfterSec ?? MAIL_RESEND_MIN_INTERVAL_SEC };
  }
  const daily = await hitRateLimit(`rl:mail:${template}:${userId}:day`, {
    windowSec: 86400,
    max: MAIL_RESEND_DAILY_MAX,
  });
  if (!daily.allowed) {
    return { ok: false, retryAfterSec: daily.retryAfterSec ?? 86400 };
  }
  return { ok: true };
}
