import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  listMigrationReviews,
  OrderAdminError,
  resolveMigrationReview,
} from "@/server/services/orders/admin";

/**
 * T062 US6 D3 复核清单服务集成(api-admin 契约;data-model §2.9):
 * 列表默认待复核+detail 两口径;approve→completed/驳回→cancelled+审计 review_resolved;
 * 已落定重复 resolve 404;已终态(refunded)单不被翻转。
 */
const RUN = Date.now().toString(36);
const U = `t62${RUN}`;
const ORDER_NO = `WP-T62-${RUN}`;
const WP_ORDER_A = 9_450_001; // 待复核→approve
const WP_ORDER_B = 9_450_002; // 待复核→驳回
const WP_ORDER_C = 9_450_003; // 已 refunded 终态→approve 不翻转
const WP_ORDER_D = 9_450_004; // 已落定→重复 resolve 404

let userId = 0n;
const reviewIds: bigint[] = [];
let operatorId = 0n;

async function seedOne(wpOrderId: number, orderStatus: "pending" | "refunded") {
  const order = await prisma.order.create({
    data: {
      orderNo: `${ORDER_NO}-${wpOrderId}`,
      userId,
      status: orderStatus,
      pointCost: 50,
      legacyWpOrderId: wpOrderId,
      ...(orderStatus === "refunded" ? { refundedAt: new Date() } : {}),
    },
    select: { id: true },
  });
  const review = await prisma.migrationReviewItem.create({
    data: {
      legacyWpOrderId: wpOrderId,
      reason: "amount_mismatch",
      detail: { paid: 45, expected: 50 },
    },
    select: { id: true },
  });
  reviewIds.push(review.id);
  return { orderId: order.id, reviewId: review.id };
}

afterAll(async () => {
  await prisma.migrationReviewItem.deleteMany({ where: { id: { in: reviewIds } } });
  await prisma.order.deleteMany({ where: { legacyWpOrderId: { in: [WP_ORDER_A, WP_ORDER_B, WP_ORDER_C, WP_ORDER_D] } } });
  const audits = await prisma.auditLog.findMany({
    where: { category: AUDIT_CATEGORY.ADMIN, action: AUDIT_ACTION.REVIEW_RESOLVED },
    select: { id: true, payloadJson: true },
  });
  const ridSet = new Set(reviewIds.map((id) => id.toString()));
  const auditIds = audits
    .filter((x) => ridSet.has((x.payloadJson as { reviewId?: string }).reviewId ?? ""))
    .map((x) => x.id);
  if (auditIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
  }
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("US6 D3 复核清单(T062)", () => {
  it("列表默认待复核并带订单两口径;approve/驳回按 §2.9 落定+审计", async () => {
    const user = await prisma.user.create({
      data: {
        username: U,
        email: `${U}@test.local`,
        passwordHash: "$P$T062hashplaceholder",
        passwordAlgo: "phpass",
        updatedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
    operatorId = user.id; // 测试内自审,审计断言只看动作不看操作者
    const a = await seedOne(WP_ORDER_A, "pending");
    const b = await seedOne(WP_ORDER_B, "pending");
    const c = await seedOne(WP_ORDER_C, "refunded");
    const d = await seedOne(WP_ORDER_D, "pending");
    // d 预置为已落定
    await prisma.migrationReviewItem.update({
      where: { id: d.reviewId },
      data: { resolvedAt: new Date(), resolvedBy: userId },
    });

    // 默认列表:只含未落定 a/b/c;detail 透传两口径
    const pending = await listMigrationReviews({ resolved: "0", page: 1 });
    const ids = new Set(pending.items.map((i) => i.id));
    expect(ids.has(a.reviewId.toString())).toBe(true);
    expect(ids.has(b.reviewId.toString())).toBe(true);
    expect(ids.has(c.reviewId.toString())).toBe(true);
    expect(ids.has(d.reviewId.toString())).toBe(false);
    const rowA = pending.items.find((i) => i.legacyWpOrderId === WP_ORDER_A)!;
    expect(rowA.detail).toEqual({ paid: 45, expected: 50 });
    expect(rowA.orderStatus).toBe("pending");

    // 已落定列表:只含 d
    const done = await listMigrationReviews({ resolved: "1" });
    expect(done.items.map((i) => i.id)).toContain(d.reviewId.toString());

    // approve→completed+completedAt;审计含 approve:true
    await resolveMigrationReview(a.reviewId, { approve: true, note: "T062 通过" }, operatorId, "127.0.0.1");
    const orderA = await prisma.order.findUnique({ where: { legacyWpOrderId: WP_ORDER_A } });
    expect(orderA?.status).toBe("completed");
    expect(orderA?.completedAt).not.toBeNull();
    const audits = await prisma.auditLog.findMany({
      where: { category: AUDIT_CATEGORY.ADMIN, action: AUDIT_ACTION.REVIEW_RESOLVED },
    });
    const auditA = audits.find(
      (x) => (x.payloadJson as { reviewId?: string }).reviewId === a.reviewId.toString(),
    );
    expect(auditA).toBeDefined();
    expect(auditA!.payloadJson).toMatchObject({ approve: true, note: "T062 通过" });

    // 驳回→cancelled+cancelledAt
    await resolveMigrationReview(b.reviewId, { approve: false }, operatorId);
    const orderB = await prisma.order.findUnique({ where: { legacyWpOrderId: WP_ORDER_B } });
    expect(orderB?.status).toBe("cancelled");
    expect(orderB?.cancelledAt).not.toBeNull();

    // refunded 终态不被 approve 翻转;review 本身仍落定
    await resolveMigrationReview(c.reviewId, { approve: true }, operatorId);
    const orderC = await prisma.order.findUnique({ where: { legacyWpOrderId: WP_ORDER_C } });
    expect(orderC?.status).toBe("refunded");
    const reviewC = await prisma.migrationReviewItem.findUnique({ where: { id: c.reviewId } });
    expect(reviewC?.resolvedAt).not.toBeNull();

    // 重复 resolve→404 语义
    await expect(
      resolveMigrationReview(a.reviewId, { approve: true }, operatorId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
