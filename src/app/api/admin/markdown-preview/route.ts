import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";

const schema = z.object({ bodyMd: z.string().max(200_000) });

/**
 * 编辑器实时预览(FR-215):与前台同一条 unified 管线(GFM/高亮/sanitize/TOC/
 * 图片白名单),预览即所见;admin-only 防滥用(渲染有成本)。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { html, toc } = await renderMarkdown(parsed.data.bodyMd, {
    cdnHosts: await getCdnHosts(),
  });
  return apiOk({ html, toc });
}
