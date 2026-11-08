import "server-only";
import { prisma } from "@/lib/db/business";
import { groupKeys, isSettingsGroup } from "@/server/services/settings/schemas";

/**
 * 组内各键的现值(原始明文):仅服务层内部用于敏感位回填,
 * 出口(视图/接口)一律脱敏,任何明文不进前端。
 */
export async function getCurrentGroupValues(group: string): Promise<Record<string, string>> {
  if (!isSettingsGroup(group)) return {};
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: Object.values(groupKeys[group]) } },
    select: { key: true, value: true },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
