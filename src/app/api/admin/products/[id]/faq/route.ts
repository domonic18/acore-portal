import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  createProductFaq,
  listAdminProductFaqs,
  ProductAdminError,
  reorderProductFaqs,
} from "@/server/services/catalog/admin";
import { PRODUCT_FAQ_LIMITS } from "@/constants/shop";

/**
 * 商品 FAQ 后台接口(#159):GET 列表 / POST 新增 / PUT 重排。
 * 子资源挂在商品下,商品不存在一律 404;字段长度越界 422。
 */
const faqSchema = z.object({
  question: z.string().trim().min(1).max(PRODUCT_FAQ_LIMITS.questionMax),
  answer: z.string().trim().min(1).max(PRODUCT_FAQ_LIMITS.answerMax),
});

const reorderSchema = z.object({
  ids: z.array(z.string().regex(/^\d+$/)).min(1).max(100),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  try {
    const items = await listAdminProductFaqs(BigInt(id));
    return apiOk({ items });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  const parsed = await parseBody(req, faqSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await createProductFaq(
      { productId: BigInt(id), ...parsed.data },
      BigInt(guard.session.userId),
    );
    return apiOk({ ok: true }, 201);
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  const parsed = await parseBody(req, reorderSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await reorderProductFaqs(
      { productId: BigInt(id), ids: parsed.data.ids },
      BigInt(guard.session.userId),
    );
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}
