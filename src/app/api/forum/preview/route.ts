import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";

const schema = z.object({ content: z.string().max(20_000) });

/** 论坛发帖/回帖实时预览(#34):与前台同管线(renderMarkdown 白名单),登录用户 */
export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { html } = await renderMarkdown(parsed.data.content, {
    cdnHosts: await getCdnHosts(),
  });
  return apiOk({ html });
}
