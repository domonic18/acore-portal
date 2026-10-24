import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { incrementArticleViews } from "@/server/services/content/articles";

/** 阅读计数上报(R2/SC-203):客户端水合后 POST,原子自增防并发丢失 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const views = await incrementArticleViews(decodeURIComponent(params.slug));
  if (views == null) return apiError(404, "NOT_FOUND", "文章不存在。");
  return apiOk({ views });
}
