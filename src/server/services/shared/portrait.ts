import { redis } from "@/lib/redis";
import { getCharactersDb } from "@/lib/db/characters";
import { PORTRAIT_DEFAULT, portraitPath } from "@/constants/portraits";

/**
 * 页头随机角色头图(M3 US1,R10):characters 只读抽样 → race/class/gender 映射
 * 静态头像;Redis 60s 平滑缓存;抽样失败/超时(500ms)降级默认图(FR-203)。
 */
const CACHE_KEY = "m3:portrait";
const CACHE_TTL_SECONDS = 60;
const QUERY_TIMEOUT_MS = 500;

type Sample = { race: number; class: number; gender: number };

/** 依赖注入面(单测注入假查询;默认 characters 库 ORDER BY RAND 抽样) */
export type PortraitDeps = {
  query?: () => Promise<Sample | null>;
  cache?: {
    get: (key: string) => Promise<string | null>;
    set: (
      key: string,
      value: string,
      mode: "EX",
      ttl: number,
    ) => Promise<unknown>;
  };
};

async function sampleFromCharacters(): Promise<Sample | null> {
  const db = await getCharactersDb();
  // 6K 行规模全表扫可接受(页头非高频热点;R10)
  const rows = await db.$queryRaw<Sample[]>`
    SELECT race, class, gender FROM characters WHERE level > 0 ORDER BY RAND() LIMIT 1`;
  return rows[0] ?? null;
}

function mapToUrl(sample: Sample | null): string {
  if (!sample) return PORTRAIT_DEFAULT;
  return portraitPath(sample.race, sample.class, sample.gender) ?? PORTRAIT_DEFAULT;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function getRandomPortraitUrl(
  deps: PortraitDeps = {},
): Promise<string> {
  const cache = deps.cache ?? redis;
  const cached = await cache.get(CACHE_KEY).catch(() => null);
  if (cached) return cached;

  const sample = await withTimeout(
    (deps.query ?? sampleFromCharacters)().catch(() => null),
    QUERY_TIMEOUT_MS,
  );
  const url = mapToUrl(sample);
  await cache
    .set(CACHE_KEY, url, "EX", CACHE_TTL_SECONDS)
    .catch(() => undefined);
  return url;
}
