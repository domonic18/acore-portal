import "server-only";

import { prisma } from "@/lib/db/business";
import type { SearchEntityType } from "@/constants/search";

/**
 * 向量存储(search_embedding):归一化 Float32 小端 BLOB,点积即余弦。
 * 召回 = 按实体类型全量载入后进程内暴力扫(存量 <2 万行毫秒级;
 * 预设 >5 万行告警阈值,超限再评估分批/外置,不过度设计)。
 */

export interface UpsertVectorRow {
  entityType: SearchEntityType;
  entityId: string;
  dim: number;
  contentHash: string;
  vector: number[];
}

export interface StoredVector {
  entityType: SearchEntityType;
  entityId: string;
  dim: number;
  contentHash: string;
}

export interface SemanticCandidate {
  /** 融合键 `{entityType}:{entityId}`(与 FULLTEXT 路同域) */
  key: string;
  entityType: SearchEntityType;
  entityId: string;
  score: number;
}

/** Float32 数组 → 小端 BLOB(prisma Bytes 字段类型为 Uint8Array<ArrayBuffer>) */
export function encodeVector(vec: number[]): Uint8Array<ArrayBuffer> {
  const arr = new Float32Array(vec);
  const bytes = new Uint8Array(arr.byteLength);
  bytes.set(new Uint8Array(arr.buffer));
  return bytes;
}

/** BLOB → number[](解码容错:长度非 4 倍数视为脏数据,返回空) */
export function decodeVector(buf: Uint8Array): number[] {
  if (buf.byteLength % 4 !== 0) return [];
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(arr);
}

export async function upsertEmbedding(row: UpsertVectorRow): Promise<void> {
  await prisma.searchEmbedding.upsert({
    where: {
      entityType_entityId: { entityType: row.entityType, entityId: BigInt(row.entityId) },
    },
    create: {
      entityType: row.entityType,
      entityId: BigInt(row.entityId),
      dim: row.dim,
      contentHash: row.contentHash,
      vector: encodeVector(row.vector),
    },
    update: {
      dim: row.dim,
      contentHash: row.contentHash,
      vector: encodeVector(row.vector),
    },
  });
}

export async function getEmbeddingRow(
  entityType: SearchEntityType,
  entityId: string,
): Promise<StoredVector | null> {
  const row = await prisma.searchEmbedding.findUnique({
    where: {
      entityType_entityId: { entityType, entityId: BigInt(entityId) },
    },
    select: { entityType: true, entityId: true, dim: true, contentHash: true },
  });
  return row
    ? {
        entityType: row.entityType as SearchEntityType,
        entityId: row.entityId.toString(),
        dim: row.dim,
        contentHash: row.contentHash,
      }
    : null;
}

/**
 * 余弦 top-K(归一化向量,点积即余弦;点积阈值 0 忽略负相关噪声)。
 * 查询向量维度与库不一致(换了 embedding 模型)返回空 = 该路降级,由回填脚本重刷。
 */
export async function vectorTopK(
  entityType: SearchEntityType,
  queryVec: number[],
  k: number,
): Promise<SemanticCandidate[]> {
  const rows = await prisma.searchEmbedding.findMany({
    where: { entityType },
    select: { entityId: true, dim: true, vector: true },
  });
  if (rows.length === 0) return [];

  const q = new Float32Array(queryVec);
  const scored: SemanticCandidate[] = [];
  for (const row of rows) {
    if (row.dim !== queryVec.length) continue;
    const v = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i]! * v[i]!;
    if (dot > 0) {
      const entityId = row.entityId.toString();
      scored.push({ key: `${entityType}:${entityId}`, entityType, entityId, score: dot });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** 该类型存量向量行数(回填脚本/看板用;>50_000 提示评估暴力扫退役) */
export async function countEmbeddings(entityType: SearchEntityType): Promise<number> {
  return prisma.searchEmbedding.count({ where: { entityType } });
}
