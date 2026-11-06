import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { recordArticleView } from "@/server/services/content/articles";
import { getClientIp } from "@/server/services/shared/client-ip";

/**
 * 阅读计数上报(R2/SC-203):客户端水合后 POST,原子自增防并发丢失。
 * 2026-11-06 撞库加固 PR-I:上报带来源 IP,服务端限速后决定是否计入
 * (限速只压写入量,不改变响应契约——越阈时返回当前阅读数,前台数字稳定)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const ip = await getClientIp(req);
  const views = await recordArticleView(decodeURIComponent(params.slug), ip);
  if (views == null) return apiError(404, "NOT_FOUND", "文章不存在。");
  return apiOk({ views });
}
