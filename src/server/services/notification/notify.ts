import "server-only";
import type { Prisma } from "@/generated/business";
import { getConfig } from "@/lib/config";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { POINT_TX_TYPE_LABEL, type PointTxTypeValue } from "@/constants/points";
import { enqueueMail } from "@/server/services/mail/outbox";

/**
 * 站内信写入(FR-309,SC-304):账本阻塞点同事务调用,
 * INSERT+阈值判断+enqueueMail 全走调用方 tx——账本回滚则通知与邮件零残留。
 * 阈值邮件:notify.pointEmailThreshold(绝对值比较,0=不发,FR-311)。
 */
export async function notifyPointsChange(
  tx: Prisma.TransactionClient,
  input: {
    userId: bigint;
    delta: number;
    balanceAfter: number;
    type: PointTxTypeValue;
    refNote?: string | null;
  },
): Promise<void> {
  const label = POINT_TX_TYPE_LABEL[input.type] ?? input.type;
  const title =
    input.delta >= 0 ? `积分入账 +${input.delta}` : `积分扣减 ${input.delta}`;
  // remark 与类型标签同文(如注册奖励)时不重复拼接
  const body =
    input.refNote && input.refNote !== label
      ? `${label}:${input.refNote},当前余额 ${input.balanceAfter}`
      : `${label},当前余额 ${input.balanceAfter}`;
  await tx.notification.create({
    data: {
      userId: input.userId,
      type: "points",
      title,
      body,
      linkUrl: "/account/points",
    },
  });

  const { notify } = await getConfig();
  const threshold = notify.pointEmailThreshold;
  if (threshold > 0 && Math.abs(input.delta) >= threshold) {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { username: true, email: true },
    });
    if (user) {
      await enqueueMail(tx, {
        to: user.email,
        template: MAIL_TEMPLATE.POINTS_NOTIFY,
        payload: {
          username: user.username,
          delta: input.delta,
          balance: input.balanceAfter,
          reason: label,
        },
        relatedUserId: input.userId,
      });
    }
  }
}
