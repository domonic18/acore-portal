// RRF(Reciprocal Rank Fusion)融合:纯函数,单测锚死(tests/unit/search-rrf.test.ts)
// spec §19 口径:k=60;score = Σ 1/(k + rank),rank 从 1 起

import { SEARCH_RRF_K } from "@/constants/search";

/**
 * 多路有序 id 列表融合。同 id 多路命中分数叠加(两路都命中 = 最强信号)。
 * 返回 id → 分数映射,调用方按分数降序取。
 */
export function rrfFuse(rankedList: string[], ...moreLists: string[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of [rankedList, ...moreLists]) {
    list.forEach((key, i) => {
      scores.set(key, (scores.get(key) ?? 0) + 1 / (SEARCH_RRF_K + i + 1));
    });
  }
  return scores;
}

/** 按融合分数降序的 id 序列 */
export function rrfRank(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
