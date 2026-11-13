import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import { listProductFaqs } from "@/server/services/catalog/products";
import {
  createProductFaq,
  deleteProductFaq,
  listAdminProductFaqs,
  ProductAdminError,
  reorderProductFaqs,
  updateProductFaq,
} from "@/server/services/catalog/admin";

/**
 * 商品 FAQ(#159)集成:后台 CRUD + 排序 + 前台只读展示 + 审计脱敏。
 */
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `mfaq-${RUN}-`;
const CATEGORY_SLUG = `mfaq-cat-${RUN}`;
const ACTOR = 9_950_038_001n; // 审计 actor(无 FK,用后按 actor 清)

let categoryId = 0n;
let productId = 0n;
let emptyProductId = 0n;

beforeAll(async () => {
  const category = await prisma.productCategory.create({
    data: { name: `FAQ 分类 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
    select: { id: true },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      sku: `itemsend_${RUN}`,
      slug: `${SLUG_PREFIX}main`,
      name: `FAQ 商品 ${RUN}`,
      description: "FAQ 集成测试",
      type: "game_item",
      status: "published",
      listed: true,
      price: 100,
      categoryId,
    },
    select: { id: true },
  });
  productId = product.id;

  const other = await prisma.product.create({
    data: {
      sku: `itemsend_x${RUN}`,
      slug: `${SLUG_PREFIX}other`,
      name: `FAQ 空商品 ${RUN}`,
      description: "FAQ 集成测试",
      type: "game_item",
      status: "published",
      listed: true,
      price: 100,
      categoryId,
    },
    select: { id: true },
  });
  emptyProductId = other.id;
});

afterAll(async () => {
  await prisma.productFaq.deleteMany({ where: { productId: { in: [productId, emptyProductId] } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
});

describe("商品 FAQ 后台 CRUD(#159)", () => {
  it("新增问答落库并按 sort 升序返回", async () => {
    await createProductFaq(
      { productId, question: "发货要多久?", answer: "一般 5 分钟内" },
      ACTOR,
    );
    await createProductFaq(
      { productId, question: "能退吗?", answer: "发货后不支持退款" },
      ACTOR,
    );

    const items = await listAdminProductFaqs(productId);
    expect(items.map((i) => i.question)).toEqual(["发货要多久?", "能退吗?"]);
    expect(items[0]?.sort).toBe(0);
    expect(items[1]?.sort).toBe(1);
  });

  it("问题或答案为空 → VALIDATION_FAILED;问题超长同样拒绝", async () => {
    await expect(
      createProductFaq({ productId, question: "  ", answer: "有答案" }, ACTOR),
    ).rejects.toBeInstanceOf(ProductAdminError);
    await expect(
      createProductFaq({ productId, question: "有问", answer: "   " }, ACTOR),
    ).rejects.toBeInstanceOf(ProductAdminError);
    await expect(
      createProductFaq({ productId, question: "问".repeat(256), answer: "答案" }, ACTOR),
    ).rejects.toBeInstanceOf(ProductAdminError);
  });

  it("商品不存在 → NOT_FOUND", async () => {
    await expect(
      createProductFaq({ productId: 999_999_999n, question: "问", answer: "答" }, ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("更新问答:改内容生效,不属该商品的问答报 NOT_FOUND", async () => {
    const [first] = await listAdminProductFaqs(productId);
    expect(first).toBeDefined();
    const id = BigInt(first!.id);

    await updateProductFaq(
      { productId, faqId: id, question: "发货要多久?", answer: "通常 5 分钟内到账" },
      ACTOR,
    );
    const after = await listAdminProductFaqs(productId);
    expect(after[0]?.answer).toBe("通常 5 分钟内到账");

    await expect(
      updateProductFaq(
        { productId: emptyProductId, faqId: id, question: "问", answer: "答" },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("重排:按传入 id 顺序重写 sort", async () => {
    const items = await listAdminProductFaqs(productId);
    expect(items.length).toBe(2);
    const reversed = [items[1]!.id, items[0]!.id];

    await reorderProductFaqs({ productId, ids: reversed }, ACTOR);
    const after = await listAdminProductFaqs(productId);
    expect(after.map((i) => i.id)).toEqual(reversed);
    expect(after.map((i) => i.sort)).toEqual([0, 1]);

    // 传不属于该商品的 id → NOT_FOUND,且不改数据
    await expect(
      reorderProductFaqs({ productId, ids: [items[0]!.id, "999999999"] }, ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listAdminProductFaqs(productId)).map((i) => i.id)).toEqual(reversed);

    // 只传子集 → VALIDATION_FAILED(子集 sort 会与未传行撞值,顺序被静默打乱)
    await expect(
      reorderProductFaqs({ productId, ids: [items[0]!.id] }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect((await listAdminProductFaqs(productId)).map((i) => i.id)).toEqual(reversed);
  });

  it("删除问答:删后不再返回;删不存在的报 NOT_FOUND", async () => {
    const items = await listAdminProductFaqs(productId);
    const id = BigInt(items[0]!.id);

    await deleteProductFaq({ productId, faqId: id }, ACTOR);
    expect(await listAdminProductFaqs(productId)).toHaveLength(1);

    await expect(deleteProductFaq({ productId, faqId: id }, ACTOR)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("前台只读接口返回问答(按 sort 升序),无问答商品返回空", async () => {
    const faqs = await listProductFaqs(productId.toString());
    expect(faqs).toHaveLength(1);
    // 前序用例重排后删的是「能退吗?」,留下的是「发货要多久?」
    expect(faqs[0]?.question).toBe("发货要多久?");
    expect(await listProductFaqs(emptyProductId.toString())).toEqual([]);
  });

  it("审计落 product_faq_saved / product_faq_deleted,payload 不含问答正文", async () => {
    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: ACTOR },
      orderBy: { id: "asc" },
      select: { action: true, payloadJson: true },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain(AUDIT_ACTION.PRODUCT_FAQ_SAVED);
    expect(actions).toContain(AUDIT_ACTION.PRODUCT_FAQ_DELETED);
    expect(JSON.stringify(audits)).not.toContain("发货要多久");
  });
});
