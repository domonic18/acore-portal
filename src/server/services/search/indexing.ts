import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/business";
import type { SearchEntityType } from "@/constants/search";
import { getEmbeddingTexts } from "./embedding";
import { getEmbeddingRow, upsertEmbedding } from "./vector-store";

/**
 * 向量索引原语:单实体「取行 → 建索引文本 → hash 比对 → embed → upsert」。
 * 后台保存钩子(content/catalog 域)与回填脚本共用;
 * hash 未变跳过(不重算),通道未配置返回 no-channel(调用方静默,不上抛)。
 */

/**
 * 保存钩子一行式:后台保存/删除后调度重索引。
 * 后台异步执行不阻塞保存(embedding 通道抖动时保存不卡);
 * 失败只记日志,由回填脚本(backfill-embeddings.ts,hash 幂等)周期兜底。
 */
export function scheduleIndex(entityType: SearchEntityType, entityId: bigint | string): void {
  void indexEntity(entityType, entityId.toString()).catch((err: unknown) => {
    console.warn(`[search] 向量索引失败 ${entityType}:${entityId}`, err);
  });
}

export type IndexOutcome =
  | "indexed" // 新建或内容变更,已重算
  | "skipped" // 内容 hash 未变,跳过
  | "removed" // 实体不可见(下稿/软删/缺行),向量已清
  | "no-channel"; // embedding 通道未配置,未处理(回填脚本兜底)

interface IndexableRow {
  text: string;
}

export async function indexEntity(
  entityType: SearchEntityType,
  entityId: string,
  opts?: { force?: boolean },
): Promise<IndexOutcome> {
  const id = BigInt(entityId);
  const row = await loadIndexableRow(entityType, id);
  if (!row) {
    await removeEmbedding(entityType, entityId);
    return "removed";
  }
  const hash = sha256(row.text);
  const existing = await getEmbeddingRow(entityType, entityId);
  if (!opts?.force && existing && existing.contentHash === hash) return "skipped";

  const vecs = await getEmbeddingTexts([row.text]);
  const vec = vecs?.[0];
  if (!vec) return "no-channel";

  await upsertEmbedding({
    entityType,
    entityId,
    dim: vec.length,
    contentHash: hash,
    vector: vec,
  });
  return "indexed";
}

/** 实体当前不可索引(未发布/软删/行缺失)时清向量,防止语义路召回死链 */
export async function removeEmbedding(
  entityType: SearchEntityType,
  entityId: string,
): Promise<void> {
  await prisma.searchEmbedding
    .delete({
      where: { entityType_entityId: { entityType, entityId: BigInt(entityId) } },
    })
    .catch(() => undefined); // 不存在即目标态
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function loadIndexableRow(
  entityType: SearchEntityType,
  id: bigint,
): Promise<IndexableRow | null> {
  switch (entityType) {
    case "article": {
      const r = await prisma.article.findFirst({
        where: { id, status: "published" },
        select: { title: true, bodyMd: true },
      });
      return r ? { text: `${r.title}\n${r.bodyMd}` } : null;
    }
    case "content_page": {
      const r = await prisma.contentPage.findFirst({
        where: { id, status: "published" },
        select: { title: true, bodyMd: true },
      });
      return r ? { text: `${r.title}\n${r.bodyMd}` } : null;
    }
    case "product": {
      const r = await prisma.product.findFirst({
        where: { id, status: "published", listed: true },
        select: { name: true, description: true, detailMd: true },
      });
      return r ? { text: `${r.name}\n${r.description}\n${r.detailMd ?? ""}` } : null;
    }
    case "product_faq": {
      const r = await prisma.productFaq.findFirst({
        where: { id, product: { status: "published", listed: true } },
        select: { question: true, answer: true },
      });
      return r ? { text: `${r.question}\n${r.answer}` } : null;
    }
    case "forum_thread": {
      // W1 只索引主题标题(楼层正文新旧混存,待剥离方案后扩)
      const r = await prisma.forumThread.findFirst({
        where: { id, deletedAt: null },
        select: { title: true },
      });
      return r ? { text: r.title } : null;
    }
  }
}
