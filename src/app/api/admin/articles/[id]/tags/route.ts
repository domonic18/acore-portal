import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { setArticleTags } from "@/server/services/content/admin";
import { mapContentError } from "../../../_shared/content";

const schema = z.object({
  tagIds: z.array(z.coerce.number().int().positive()).max(20),
});

/** 标签全量替换(契约 api-admin-m3 POST /{id}/tags) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "文章不存在。");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    await setArticleTags(
      BigInt(id),
      parsed.data.tagIds.map((n) => BigInt(n)),
      BigInt(guard.session.userId),
    );
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
