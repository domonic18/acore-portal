import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { createBanner } from "@/server/services/home/banners";
import { bannerSchema } from "../_shared/banners";

/** 新建轮播物料 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, bannerSchema);
  if (!parsed.ok) return parsed.response;
  const id = await createBanner(parsed.data, BigInt(guard.session.userId));
  return apiOk({ id: id.toString() });
}
