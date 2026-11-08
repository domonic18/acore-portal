import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { deleteProductFaq, ProductAdminError, updateProductFaq } from "@/server/services/catalog/admin";
import { PRODUCT_FAQ_LIMITS } from "@/constants/shop";

/**
 * 单条商品 FAQ 的更新与删除(#159):FAQ 必须属于该商品,否则 404。
 */
const faqSchema = z.object({
  question: z.string().trim().min(1).max(PRODUCT_FAQ_LIMITS.questionMax),
  answer: z.string().trim().min(1).max(PRODUCT_FAQ_LIMITS.answerMax),
});

function parseIds(id: string, faqId: string): { productId: bigint; faqId: bigint } | null {
  const productId = Number(id);
  const faq = Number(faqId);
  if (!Number.isInteger(productId) || productId <= 0) return null;
  if (!Number.isInteger(faq) || faq <= 0) return null;
  return { productId: BigInt(productId), faqId: BigInt(faq) };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; faqId: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const ids = parseIds(params.id, params.faqId);
  if (!ids) return apiError(404, "NOT_FOUND", "常见问题不存在。");
  const parsed = await parseBody(req, faqSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await updateProductFaq({ ...ids, ...parsed.data }, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; faqId: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const ids = parseIds(params.id, params.faqId);
  if (!ids) return apiError(404, "NOT_FOUND", "常见问题不存在。");

  try {
    await deleteProductFaq(ids, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}
