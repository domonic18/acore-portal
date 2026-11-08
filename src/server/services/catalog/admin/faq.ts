import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { PRODUCT_FAQ_LIMITS } from "@/constants/shop";
import { writeAudit } from "@/server/services/shared/audit";
import { ProductAdminError } from "./shared";

/**
 * 商品 FAQ 后台 CRUD(#159):
 * 问答挂在商品下(product_faq),后台按商品增删改排;前台详情页只读展示。
 * 审计只落 id,不落问答正文(T048 脱敏口径)。
 */

export type AdminProductFaq = {
  id: string;
  question: string;
  answer: string;
  sort: number;
};

function normalizeText(raw: string, max: number, label: string): string {
  const text = raw.trim();
  if (!text) throw new ProductAdminError("VALIDATION_FAILED", `${label}不能为空。`);
  if (text.length > max) {
    throw new ProductAdminError("VALIDATION_FAILED", `${label}不能超过 ${max} 字。`);
  }
  return text;
}

/** 商品不存在即 404(FAQ 是商品的子资源,不能挂在不存在的商品下) */
async function assertProductExists(productId: bigint): Promise<void> {
  const hit = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!hit) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
}

export async function listAdminProductFaqs(productId: bigint): Promise<AdminProductFaq[]> {
  const rows = await prisma.productFaq.findMany({
    where: { productId },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, question: true, answer: true, sort: true },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    question: r.question,
    answer: r.answer,
    sort: r.sort,
  }));
}

export async function createProductFaq(
  input: { productId: bigint; question: string; answer: string },
  actorId: bigint,
): Promise<void> {
  await assertProductExists(input.productId);
  const question = normalizeText(input.question, PRODUCT_FAQ_LIMITS.questionMax, "问题");
  const answer = normalizeText(input.answer, PRODUCT_FAQ_LIMITS.answerMax, "答案");

  const last = await prisma.productFaq.findFirst({
    where: { productId: input.productId },
    orderBy: [{ sort: "desc" }, { id: "desc" }],
    select: { sort: true },
  });
  const created = await prisma.productFaq.create({
    data: { productId: input.productId, question, answer, sort: (last?.sort ?? -1) + 1 },
    select: { id: true },
  });

  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FAQ_SAVED,
    actorUserId: actorId,
    payload: { productId: input.productId.toString(), faqId: created.id.toString() },
  });
}

export async function updateProductFaq(
  input: { productId: bigint; faqId: bigint; question: string; answer: string },
  actorId: bigint,
): Promise<void> {
  const question = normalizeText(input.question, PRODUCT_FAQ_LIMITS.questionMax, "问题");
  const answer = normalizeText(input.answer, PRODUCT_FAQ_LIMITS.answerMax, "答案");

  const hit = await prisma.productFaq.updateMany({
    where: { id: input.faqId, productId: input.productId },
    data: { question, answer },
  });
  if (hit.count === 0) throw new ProductAdminError("NOT_FOUND", "常见问题不存在。");

  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FAQ_SAVED,
    actorUserId: actorId,
    payload: { productId: input.productId.toString(), faqId: input.faqId.toString() },
  });
}

export async function deleteProductFaq(
  input: { productId: bigint; faqId: bigint },
  actorId: bigint,
): Promise<void> {
  const hit = await prisma.productFaq.deleteMany({
    where: { id: input.faqId, productId: input.productId },
  });
  if (hit.count === 0) throw new ProductAdminError("NOT_FOUND", "常见问题不存在。");

  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FAQ_DELETED,
    actorUserId: actorId,
    payload: { productId: input.productId.toString(), faqId: input.faqId.toString() },
  });
}

/**
 * 重排:传入该商品 FAQ 的完整 id 顺序,按序重写 sort(0 起)。
 * 必须覆盖该商品的全部问答——只传子集会让子集 sort 与未传行撞值,
 * 顺序被静默打乱,故不完整即拒。
 */
export async function reorderProductFaqs(
  input: { productId: bigint; ids: string[] },
  actorId: bigint,
): Promise<void> {
  const ids = input.ids.map((s) => BigInt(s));
  const all = await prisma.productFaq.findMany({
    where: { productId: input.productId },
    select: { id: true },
  });
  const owned = all.filter((a) => ids.includes(a.id));
  if (owned.length !== ids.length) {
    throw new ProductAdminError("NOT_FOUND", "常见问题不存在。");
  }
  if (all.length !== ids.length) {
    throw new ProductAdminError(
      "VALIDATION_FAILED",
      "排序必须覆盖该商品的全部常见问题,请刷新后重试。",
    );
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.productFaq.update({ where: { id }, data: { sort: index } }),
    ),
  );

  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FAQ_SAVED,
    actorUserId: actorId,
    payload: { productId: input.productId.toString(), count: ids.length },
  });
}
