import "server-only";

import {
  SEARCH_GROUP_LIMIT,
  SEARCH_GROUPS,
  SEARCH_SEMANTIC_TOPK,
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
  type SearchGroup,
} from "@/constants/search";
import { buildBooleanQuery, extractTerms } from "./highlight";
import { fulltextCount, fulltextSearch, type FulltextHit } from "./fulltext";
import { getEmbeddingTexts } from "./embedding";
import { vectorTopK, type SemanticCandidate } from "./vector-store";
import { rrfFuse, rrfRank } from "./rrf";
import {
  ENTITY_GROUP,
  fetchEntityRows,
  rowToHit,
  type EntityRow,
  type SearchHit,
} from "./entities";

/**
 * 站内搜索单一收口(spec §19):MySQL ngram FULLTEXT(字段加权)+ 语义向量
 * (embedding 余弦)两路召回,组内 RRF k=60 融合。
 * 结果页降级态列表与(W6)Agent 检索工具共用本函数;
 * embedding 通道未配置/故障时自动退化为纯关键词,调用方无感。
 */

export interface SearchGroupResult {
  group: SearchGroup;
  hits: SearchHit[];
  total: number;
}

export interface SearchSiteResult {
  q: string;
  groups: SearchGroupResult[];
  total: number;
  /** 本次是否实际启用了语义召回(配置+调用双口径) */
  semantic: boolean;
}

export interface SearchSiteParams {
  q: string;
  groups?: SearchGroup[];
  limitPerGroup?: number;
}

export async function searchSite(params: SearchSiteParams): Promise<SearchSiteResult> {
  const q = params.q.trim();
  const groups = params.groups ?? [...SEARCH_GROUPS];
  const limitPerGroup = params.limitPerGroup ?? SEARCH_GROUP_LIMIT;

  const terms = extractTerms(q);
  const bq = buildBooleanQuery(terms);
  if (terms.length === 0 || !bq) {
    return {
      q,
      groups: groups.map((group) => ({ group, hits: [], total: 0 })),
      total: 0,
      semantic: false,
    };
  }

  const [ftHitsByGroup, ftCountsByGroup, semantic] = await Promise.all([
    Promise.all(
      groups.map(async (g) => [g, await fulltextSearch(g, bq, limitPerGroup * 2)] as const),
    ),
    Promise.all(groups.map(async (g) => [g, await fulltextCount(g, bq)] as const)),
    semanticCandidates(q),
  ]);

  const ftCounts = new Map(ftCountsByGroup);
  const groupResults: SearchGroupResult[] = [];
  let grandTotal = 0;

  for (const [group, ftHits] of ftHitsByGroup) {
    const groupSemantic = semantic.filter((c) => ENTITY_GROUP[c.entityType] === group);
    const ftKeys = ftHits.map((h) => h.key);
    const semKeys = groupSemantic.map((c) => c.key);

    const fused = rrfRank(rrfFuse(ftKeys, semKeys)).slice(0, limitPerGroup);
    const rows = await fetchRows(fused);
    const hits = fused
      .map((key) => rows.get(key))
      .filter((r): r is EntityRow => r !== undefined)
      .map((row) => rowToHit(row, terms));

    // total = FULLTEXT 全量命中数 + 语义路新增(FULLTEXT 未覆盖的候选)
    const ftKeySet = new Set(ftKeys);
    const semanticExtra = semKeys.filter((k) => !ftKeySet.has(k)).length;
    const groupTotal = (ftCounts.get(group) ?? 0) + semanticExtra;

    groupResults.push({ group, hits, total: groupTotal });
    grandTotal += groupTotal;
  }

  return { q, groups: groupResults, total: grandTotal, semantic: semantic.length > 0 };
}

/**
 * 语义召回:查询转向量 → 各实体类型余弦 top-K。
 * 通道未配置(getEmbeddingTexts null)或故障(EmbeddingError)一律返回空 = 降级纯关键词。
 */
async function semanticCandidates(q: string): Promise<SemanticCandidate[]> {
  let queryVec: number[] | undefined;
  try {
    const vecs = await getEmbeddingTexts([q]);
    queryVec = vecs?.[0];
  } catch {
    return [];
  }
  if (!queryVec) return [];

  const perType = await Promise.all(
    SEARCH_ENTITY_TYPES.map((t) => vectorTopK(t, queryVec!, SEARCH_SEMANTIC_TOPK)),
  );
  return perType.flat();
}

/** 融合键集合 → 实体行(按类型并行回查) */
async function fetchRows(keys: string[]): Promise<Map<string, EntityRow>> {
  const idsByType = new Map<SearchEntityType, string[]>();
  for (const key of keys) {
    const sep = key.indexOf(":");
    const entityType = key.slice(0, sep) as SearchEntityType;
    const id = key.slice(sep + 1);
    idsByType.set(entityType, [...(idsByType.get(entityType) ?? []), id]);
  }
  const maps = await Promise.all(
    [...idsByType.entries()].map(([type, ids]) => fetchEntityRows(type, ids)),
  );
  return new Map(maps.flatMap((m) => [...m.entries()]));
}

// FulltextHit.key 在 fulltext.ts 内构造,此处类型仅作文档锚点
export type { FulltextHit };
