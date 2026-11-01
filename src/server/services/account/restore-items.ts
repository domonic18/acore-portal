import "server-only";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import {
  characterOwnedBy,
  listRestorableItems,
  resolveGameAccountId,
  type RestorableItem,
} from "@/server/services/shared/game-identity";
import { getSiteUsername } from "@/server/services/shared/site-identity";

export type RestoreItemsResult =
  | { ok: true; items: RestorableItem[] }
  | { ok: false; reason: "USER_NOT_FOUND" | "CHARACTER_NOT_OWNED" };

/** 本人角色可恢复物品(M1 只读);越权即审计,游戏库异常上抛 GameDbError */
export async function getRestorableItems(input: {
  userId: bigint;
  guid: number;
  ip?: string | null;
}): Promise<RestoreItemsResult> {
  const username = await getSiteUsername(input.userId);
  if (username === null) return { ok: false, reason: "USER_NOT_FOUND" };

  const accountId = await resolveGameAccountId(username);
  if (accountId === null) return { ok: true, items: [] };

  const owned = await characterOwnedBy(accountId, input.guid);
  if (!owned) {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.OWNERSHIP_VIOLATION,
      actorUserId: input.userId,
      payload: { scope: "restore_items", guid: input.guid },
      ip: input.ip ?? undefined,
    });
    return { ok: false, reason: "CHARACTER_NOT_OWNED" };
  }

  return { ok: true, items: await listRestorableItems(input.guid) };
}
