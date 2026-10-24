import "server-only";
import { getCharactersDb } from "@/lib/db/characters";

/**
 * 发货时刻角色名册实查(guid+账号双条件,FR-119 归属纵深):
 * 角色被删/转移后残留订单行在此兜底;游戏库不可达按行失败处理(可补发)。
 */
export async function resolveCharacterName(
  guid: number,
  accountId: number,
): Promise<string | null> {
  try {
    const row = await (await getCharactersDb()).characters.findFirst({
      where: { guid, account: accountId },
      select: { name: true },
    });
    return row?.name ?? null;
  } catch {
    return null;
  }
}
