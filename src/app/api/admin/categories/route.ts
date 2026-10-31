import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  CategoryAdminError,
  saveCategory,
} from "@/server/services/catalog/admin";

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug 仅限小写字母/数字/连字符"),
  sort: z.coerce.number().int().min(0).default(0),
});

/** 分类新建/编辑(平铺排序);slug 唯一冲突 409。 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveCategory({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapCategoryError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.id) return apiError(422, "VALIDATION_ERROR", "参数错误:id");
  try {
    const { id } = await saveCategory({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapCategoryError(err);
  }
}

function mapCategoryError(err: unknown) {
  if (err instanceof CategoryAdminError) {
    const status = err.code === "DUPLICATE" ? 409 : 404;
    return apiError(status, err.code, err.message);
  }
  throw err;
}
