import { prisma } from "@/lib/db/business";

/**
 * 测试钉住 system_config 阈值的统一入口:
 * 库中可能已有同键行(开发库 initdb 种子、历史遗留),createMany+skipDuplicates
 * 不覆盖旧值 → 钉值失效,限速断言随库现值漂移(表现为间歇性失败)。
 * 统一走 upsert 强制写入,并返回原值快照供还原。
 */
export async function pinSystemConfig(
  entries: Record<string, string>,
): Promise<{ key: string; value: string }[]> {
  const keys = Object.keys(entries);
  const prior = await prisma.systemConfig.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
  return prior;
}

/** 还原钉住的键:原缺失的删除,原存在的写回原值 */
export async function restoreSystemConfig(
  keys: string[],
  prior: { key: string; value: string }[],
): Promise<void> {
  await prisma.systemConfig.deleteMany({ where: { key: { in: keys } } });
  if (prior.length > 0) await prisma.systemConfig.createMany({ data: prior });
}
