import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  SIDEBAR_COMPONENT_KEYS,
  SITE_PAGE_TYPES,
} from "@/constants/content";
import { SIDEBAR_LIMITS } from "@/constants/sidebar";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * 侧栏整树保存(后台 CRUD 的唯一写入口):快捷卡+内置组件页面范围一次提交,
 * 先 zod 校验整树,失败零写入;成功事务内按数组顺序重建卡片与链接、
 * 覆写组件页面范围。审计只记卡片/组件 key,不记标题/链接/范围值。
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

// 内置组件页面范围:必须恰好覆盖注册表全部键各一次(全量提交,不允许可选缺省);
// pages 允许空数组=显式全站隐藏(与卡片 min(1) 不同)
const componentsSchema = z
  .array(
    z.object({
      key: z.enum(SIDEBAR_COMPONENT_KEYS),
      pages: z.array(z.enum(SITE_PAGE_TYPES)),
    }),
  )
  .superRefine((components, ctx) => {
    const counts = new Map(components.map((c) => [c.key, (components.filter((x) => x.key === c.key).length)]));
    for (const key of SIDEBAR_COMPONENT_KEYS) {
      const n = counts.get(key) ?? 0;
      if (n !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `内置组件 ${key} 须恰好提交一次(收到 ${n} 次)`,
        });
      }
    }
  });

export type SaveSidebarResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION_FAILED"; message: string };

export async function saveSidebarData(
  cards: unknown,
  components: unknown,
  actor: { id: bigint },
): Promise<SaveSidebarResult> {
  const parsedCards = cardsSchema.safeParse(cards);
  if (!parsedCards.success) {
    const first = parsedCards.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `参数错误:${first?.path.join(".") || "cards"}`,
    };
  }
  const parsedComponents = componentsSchema.safeParse(components);
  if (!parsedComponents.success) {
    const first = parsedComponents.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `参数错误:${first?.path.join(".") || "components"}`,
    };
  }
  const cardValue = parsedCards.data;
  const componentValue = parsedComponents.data;

  await prisma.$transaction(async (tx) => {
    await tx.sidebarLink.deleteMany();
    await tx.sidebarCard.deleteMany();
    for (const [index, card] of cardValue.entries()) {
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
    for (const component of componentValue) {
      await tx.sidebarComponent.upsert({
        where: { key: component.key },
        create: { key: component.key, pages: component.pages },
        update: { pages: component.pages },
      });
    }
  });

  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SIDEBAR_CHANGED,
    actorUserId: actor.id,
    payload: {
      cards: cardValue.map((card) => card.key),
      components: componentValue.map((component) => component.key),
    },
  });
  return { ok: true };
}
