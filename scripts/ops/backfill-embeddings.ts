/**
 * 语义向量回填(部署后一次性执行 + 周期兜底)。
 *
 * 逐实体「建索引文本 → sha256 → 与 search_embedding.content_hash 比对 →
 * 仅变更者重算 embedding → upsert」;已索引且内容未变的秒过,可安全反复重跑。
 * 通道未配置时打印提示退出(不炸,等后台配好 llm.embedding.* 再跑)。
 *
 * 用法(宿主机,凭据经 .env 的 DATABASE_URL;网关配置经 system_config):
 *   tsx --conditions=react-server scripts/ops/backfill-embeddings.ts [--force]
 *   --force = 无视 content_hash 全量重算(更换 embedding 模型后用)
 */
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { createHash } from "node:crypto";

import { prisma } from "../../src/lib/db/business";
import { getEmbeddingTexts } from "../../src/server/services/search/embedding";
import { upsertEmbedding } from "../../src/server/services/search/vector-store";
import { SEARCH_ENTITY_TYPES, type SearchEntityType } from "../../src/constants/search";

const BATCH_SIZE = 50;
const BATCH_SLEEP_MS = 300;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 各类型可见实体批量取行(与后台钩子 loadIndexableRow 同一套发布口径);text 为索引文本 */
async function loadBatch(
  entityType: SearchEntityType,
  cursorId: bigint,
): Promise<{ id: bigint; text: string }[]> {
  switch (entityType) {
    case "article": {
      const rows = await prisma.article.findMany({
        where: { status: "published", id: { gt: cursorId } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, title: true, bodyMd: true },
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.bodyMd}` }));
    }
    case "content_page": {
      const rows = await prisma.contentPage.findMany({
        where: { status: "published", id: { gt: cursorId } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, title: true, bodyMd: true },
      });
      return rows.map((r) => ({ id: r.id, text: `${r.title}\n${r.bodyMd}` }));
    }
    case "product": {
      const rows = await prisma.product.findMany({
        where: { status: "published", listed: true, id: { gt: cursorId } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, name: true, description: true, detailMd: true },
      });
      return rows.map((r) => ({
        id: r.id,
        text: `${r.name}\n${r.description}\n${r.detailMd ?? ""}`,
      }));
    }
    case "product_faq": {
      const rows = await prisma.productFaq.findMany({
        where: { product: { status: "published", listed: true }, id: { gt: cursorId } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, question: true, answer: true },
      });
      return rows.map((r) => ({ id: r.id, text: `${r.question}\n${r.answer}` }));
    }
    case "forum_thread": {
      // W1 只索引主题标题(楼层正文新旧混存,待剥离方案后扩)
      const rows = await prisma.forumThread.findMany({
        where: { deletedAt: null, id: { gt: cursorId } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, title: true },
      });
      return rows.map((r) => ({ id: r.id, text: r.title }));
    }
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const probe = await getEmbeddingTexts(["连通性探针"]);
  if (!probe) {
    console.error("embedding 通道未配置(system_config 缺 llm.embedding.*),跳过回填;后台配置后重跑。");
    process.exit(0);
  }
  const dim = probe[0]?.length ?? 0;
  console.log(`embedding 通道可用,向量维度 ${dim};force=${force}`);

  const totals = { indexed: 0, skipped: 0 };
  for (const entityType of SEARCH_ENTITY_TYPES) {
    let cursorId = 0n;
    let count = 0;
    for (;;) {
      const rows = await loadBatch(entityType, cursorId);
      if (rows.length === 0) break;
      cursorId = rows[rows.length - 1]!.id;

      const texts = rows.map((r) => String(r.text));
      const hashes = texts.map(sha256);

      const existing = await prisma.searchEmbedding.findMany({
        where: { entityType, entityId: { in: rows.map((r) => r.id) } },
        select: { entityId: true, contentHash: true },
      });
      const known = new Map(existing.map((e) => [e.entityId, e.contentHash]));

      const changed: { id: bigint; hash: string; text: string }[] = [];
      rows.forEach((row, i) => {
        const hash = hashes[i]!;
        if (!force && known.get(row.id) === hash) {
          totals.skipped++;
          return;
        }
        changed.push({ id: row.id, hash, text: texts[i]! });
      });

      if (changed.length > 0) {
        const vectors = await getEmbeddingTexts(changed.map((c) => c.text));
        if (!vectors) {
          console.error("embedding 通道在回填中途不可用,终止(已索引部分保持,重跑续传)。");
          process.exit(1);
        }
        for (let i = 0; i < changed.length; i++) {
          await upsertEmbedding({
            entityType,
            entityId: changed[i]!.id.toString(),
            dim: vectors[i]!.length,
            contentHash: changed[i]!.hash,
            vector: vectors[i]!,
          });
          totals.indexed++;
        }
      }
      count += rows.length;
      process.stdout.write(`\r${entityType}: 已扫 ${count},累计 indexed=${totals.indexed} skipped=${totals.skipped}`);
      if (changed.length > 0) await sleep(BATCH_SLEEP_MS);
    }
    process.stdout.write("\n");
  }
  console.log(`完成:indexed=${totals.indexed}, skipped=${totals.skipped}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((err) => {
    console.error("回填失败:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
