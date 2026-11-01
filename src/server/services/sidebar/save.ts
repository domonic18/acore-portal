import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { SITE_PAGE_TYPES } from "@/constants/content";
import { SIDEBAR_LIMITS } from "@/constants/sidebar";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 侧栏快捷卡整树保存(后台 CRUD 的唯一写入口):
 * 先 zod 校验整树,失败零写入;成功事务内按数组顺序重建卡片与链接(sort=索引)。
 * 审计只记卡片 key,不记标题/链接值。
 */

const hrefSchema = z
  .string()
  .trim()
  .max(SIDEBAR_LIMITS.href, "链接过长")
  .refine(
    (v) =>
      (v.startsWith("/") || /^https?:\/\//.test(v)) &&
      !/[\s"'()\\]/.test(v),
    "链接须为站内路径或 http(s) 地址",
  );

const linkSchema = z.object({
  label: z.string().trim().min(1, "链接文案必填").max(SIDEBAR_LIMITS.label),
  href: hrefSchema,
  note: z.string().trim().max(SIDEBAR_LIMITS.note).optional(),
});

const cardSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]*$/, "key 只能使用小写字母/数字/连字符")
      .max(SIDEBAR_LIMITS.key),
    title: z.string().trim().min(1, "卡片标题必填").max(SIDEBAR_LIMITS.title),
    pages: z.array(z.enum(SITE_PAGE_TYPES)).min(1, "至少选择一个页面"),
    body: z.string().trim().max(SIDEBAR_LIMITS.body).optional(),
    links: z.array(linkSchema).max(SIDEBAR_LIMITS.linksPerCard),
  })
  .superRefine((card, ctx) => {
    if (card.links.length === 0 && !card.body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["links"],
        message: "卡片至少需要一个链接或正文",
      });
    }
  });

const cardsSchema = z
  .array(cardSchema)
  .max(SIDEBAR_LIMITS.cards, `最多 ${SIDEBAR_LIMITS.cards} 张卡片`)
  .superRefine((cards, ctx) => {
    const seen = new Set<string>();
    cards.forEach((card, index) => {
      if (seen.has(card.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "卡片 key 重复",
        });
      }
      seen.add(card.key);
    });
  });

export type SaveSidebarResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION_FAILED"; message: string };

export async function saveSidebarCards(
  cards: unknown,
  actor: { id: bigint },
): Promise<SaveSidebarResult> {
  const parsed = cardsSchema.safeParse(cards);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `参数错误:${first?.path.join(".") || "cards"}`,
    };
  }
  const value = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.sidebarLink.deleteMany();
    await tx.sidebarCard.deleteMany();
    for (const [index, card] of value.entries()) {
      await tx.sidebarCard.create({
        data: {
          key: card.key,
          title: card.title,
          pages: card.pages,
          body: card.body || null,
          sort: index,
          links: {
            create: card.links.map((link, linkIndex) => ({
              label: link.label,
              href: link.href,
              note: link.note || null,
              sort: linkIndex,
            })),
          },
        },
      });
    }
  });

  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SIDEBAR_CHANGED,
    actorUserId: actor.id,
    payload: { cards: value.map((card) => card.key) },
  });
  return { ok: true };
}
