import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  listAllSidebarCards,
  listSidebarComponentPages,
} from "@/server/services/sidebar/query";
import { saveSidebarData } from "@/server/services/sidebar/save";

// GET:后台侧栏全量(快捷卡按 sort + 内置组件页面范围)
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const [cards, components] = await Promise.all([
    listAllSidebarCards(),
    listSidebarComponentPages(),
  ]);
  return apiOk({ cards, components });
}

const putSchema = z.object({
  cards: z.array(z.unknown()),
  components: z.array(z.unknown()),
});

// PUT:整树保存(卡片增删改排序 + 内置组件页面范围一次提交)
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  const result = await saveSidebarData(parsed.data.cards, parsed.data.components, {
    id: BigInt(guard.session.userId),
  });
  if (!result.ok) {
    return apiError(422, result.code, result.message);
  }
  return apiOk({ ok: true });
}
