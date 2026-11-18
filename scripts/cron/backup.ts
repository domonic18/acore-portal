/**
 * 门户业务库 / WP 存量存档库备份:上传 + 校验 + 清单 + 保留期 + 告警(cron)。
 *
 * 运行位置:web 容器内。宿主既无 node_modules/COS SDK(上传要用),也无 mysql client
 * (dump 要用)⇒ 职责按容器切开:宿主编排见 scripts/cron/backup-run.sh,
 * 本脚本只负责「拿到 dump → 校验 → 上传 → 记账 → 告警」。
 *
 * 用法(容器内):
 *   tsx --conditions=react-server scripts/cron/backup.ts --target business --file /tmp/x.sql.gz
 *
 * 判据(五项全过才算成功;任一不过 = 不写清单 + 告警 + 非零退出):
 *   ① 压缩包体积达下限 ② gzip 可完整解开 ③ COS 对象大小与本地一致
 *   ④ dump 覆盖源库全部基础表 ⑤ 清单写入成功
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { createPool, type Pool } from "mysql2/promise";

import {
  BACKUP_ANCHOR_TABLES,
  BACKUP_COS_PREFIX,
  BACKUP_EXCLUDE_TABLES,
  BACKUP_MANIFEST_KEY,
  BACKUP_TARGET,
  BACKUP_TARGET_META,
  type BackupTarget,
} from "../../src/constants/backup";
import { getConfig, type SystemConfig } from "../../src/lib/config";
import {
  CreateTableScanner,
  backupObjectKey,
  backupStamp,
  buildBackupFailureCard,
  buildBackupSuccessCard,
  emptyManifest,
  expiredBackupKeys,
  judgeBackup,
  mergeManifestEntry,
  type BackupManifest,
  type BackupManifestEntry,
} from "./backup-lib";
import {
  createCosClient,
  deleteKeys,
  getBuffer,
  headSize,
  listKeys,
  putBuffer,
  putFile,
  type CosCredentials,
} from "./backup-cos";
import { describeAlert, sendOpsAlert } from "./ops-alert";

const IDENT_RE = /^[A-Za-z0-9_]+$/;

/** 标识符白名单校验后加引号(表名来自 information_schema/常量,但仍不裸拼) */
function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`非法标识符:${name}`);
  return `\`${name}\``;
}

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function parseTarget(raw: string | null): BackupTarget {
  if (raw === BACKUP_TARGET.business) return BACKUP_TARGET.business;
  if (raw === BACKUP_TARGET.wpLegacy) return BACKUP_TARGET.wpLegacy;
  throw new Error(`--target 须为 ${Object.values(BACKUP_TARGET).join(" | ")}`);
}

/**
 * 源库事实:基础表清单(判据④比对用) + 锚点表行数(恢复演练核对用)。
 * excludeTables 为该目标的排除表(dump 时跳过)——判据比对的基线必须与
 * dump 实际内容同口径,否则排除掉的表会被判成「dump 缺表」而永远失败。
 */
async function loadSourceFacts(
  pool: Pool,
  schema: string,
  anchorTables: readonly string[],
  excludeTables: readonly string[],
): Promise<{ sourceTables: string[]; anchors: Record<string, number> }> {
  const [tableRows] = await pool.query(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    [schema],
  );
  const excluded = new Set(excludeTables);
  const sourceTables = (tableRows as { t: string }[])
    .map((r) => r.t)
    .filter((t) => !excluded.has(t));
  const anchors: Record<string, number> = {};
  for (const table of anchorTables) {
    // 库内缺表则跳过(表名随业务演进而变,锚点只保证核心账面可比)
    if (!sourceTables.includes(table)) continue;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM ${quoteIdent(schema)}.${quoteIdent(table)}`,
    );
    anchors[table] = Number((rows as { c: number }[])[0]?.c ?? 0);
  }
  return { sourceTables, anchors };
}

/** 业务库的 schema 取 DATABASE_URL 指向的库(不写死库名) */
async function resolveSchema(pool: Pool, target: BackupTarget): Promise<string> {
  const fixed = BACKUP_TARGET_META[target].schema;
  if (fixed) return fixed;
  const [rows] = await pool.query("SELECT DATABASE() AS d");
  const name = String((rows as { d: string | null }[])[0]?.d ?? "");
  if (!name) throw new Error("无法确定业务库 schema(DATABASE_URL 未带库名?)");
  return name;
}

/** 流式解压扫描:解压字节数 + dump 内表名 + mysqldump 完成标记 */
async function scanDump(
  path: string,
): Promise<{ rawBytes: number; tables: string[]; footerOk: boolean }> {
  const scanner = new CreateTableScanner();
  const gunzip = createGunzip();
  const source = createReadStream(path);
  source.on("error", (err) => gunzip.destroy(err));
  source.pipe(gunzip);
  let rawBytes = 0;
  let tail = "";
  for await (const chunk of gunzip) {
    const buf = chunk as Buffer;
    rawBytes += buf.length;
    const text = buf.toString("latin1");
    scanner.push(text);
    tail = (tail + text).slice(-1024);
  }
  return {
    rawBytes,
    tables: scanner.list(),
    footerOk: tail.includes("Dump completed on"),
  };
}

async function readManifest(
  client: ReturnType<typeof createCosClient>,
  creds: CosCredentials,
): Promise<BackupManifest> {
  const buf = await getBuffer(client, creds, BACKUP_MANIFEST_KEY);
  if (!buf) return emptyManifest();
  try {
    const parsed = JSON.parse(buf.toString("utf8")) as BackupManifest;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return emptyManifest();
    return parsed;
  } catch {
    // 清单损坏不阻断备份:本次以空清单重建(旧条目丢失优于整条备份链停摆)
    return emptyManifest();
  }
}

/** 文件 sha256(流式读,不整块进内存) */
async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function main() {
  const target = parseTarget(argValue("--target"));

  if (process.argv.includes("--print-dump-args")) {
    // 宿主编排脚本据此给 mysqldump 传 --ignore-table:
    // 排除清单与判据口径同源于 BACKUP_EXCLUDE_TABLES,禁在脚本与常量各写一份
    const schema = BACKUP_TARGET_META[target].schema;
    if (schema) {
      for (const table of BACKUP_EXCLUDE_TABLES[target]) {
        console.log(`--ignore-table=${schema}.${table}`);
      }
    }
    return;
  }

  const file = argValue("--file");
  if (!file) throw new Error("--file 必填(dump 压缩包的容器内路径)");

  const cfg = await getConfig();
  const cos = cfg.cos;
  if (!cos) throw new Error("COS 未配置(system_config 缺 cos.* 键组),备份不可用");
  const creds: CosCredentials = {
    bucket: cos.bucket,
    region: cos.region,
    secretId: cos.secretId,
    secretKey: cos.secretKey,
  };
  const client = createCosClient(creds);
  const pool = createPool({ uri: process.env.DATABASE_URL ?? "", connectionLimit: 1 });
  const meta = BACKUP_TARGET_META[target];
  let uploadedKey: string | null = null;

  try {
    const fileStat = await stat(file);
    const bytes = fileStat.size;
    const sha256 = await sha256File(file);

    const schema = await resolveSchema(pool, target);
    const { sourceTables, anchors } = await loadSourceFacts(
      pool,
      schema,
      BACKUP_ANCHOR_TABLES[target],
      BACKUP_EXCLUDE_TABLES[target],
    );
    const scan = await scanDump(file);

    const judgement = judgeBackup({
      bytes,
      rawBytes: scan.rawBytes,
      minBytes: meta.minBytes,
      dumpTables: scan.tables,
      sourceTables,
      cosSize: null,
      footerOk: scan.footerOk,
    });
    if (!judgement.ok) {
      throw new Error(`校验不通过:${judgement.reasons.join(";")}`);
    }

    const key = backupObjectKey(target, backupStamp());
    await putFile(client, creds, key, file, bytes);
    uploadedKey = key;

    const cosSize = await headSize(client, creds, key);
    const sizeJudgement = judgeBackup({
      bytes,
      rawBytes: scan.rawBytes,
      minBytes: meta.minBytes,
      dumpTables: scan.tables,
      sourceTables,
      cosSize,
      footerOk: scan.footerOk,
    });
    if (!sizeJudgement.ok) {
      // 对象已落 COS 但校验不过 ⇒ 删掉,别留一个「看着像备份」的坏对象
      await deleteKeys(client, creds, [key]);
      uploadedKey = null;
      throw new Error(`校验不通过:${sizeJudgement.reasons.join(";")}`);
    }

    const entry: BackupManifestEntry = {
      target,
      schema,
      key,
      bytes,
      rawBytes: scan.rawBytes,
      sha256,
      tables: scan.tables,
      anchors,
      createdAt: new Date().toISOString(),
    };
    const manifest = mergeManifestEntry(await readManifest(client, creds), entry);
    await putBuffer(
      client,
      creds,
      BACKUP_MANIFEST_KEY,
      Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    );

    // 保留期清理:只清本目标,别把别的目标扫掉
    // (存量库冻结后永久保留;日备的清理线不该动它)
    const retentionDays = meta.keepForever ? null : (cfg.backup?.retentionDays ?? 30);
    const expired =
      retentionDays === null
        ? []
        : expiredBackupKeys(
            await listKeys(client, creds, BACKUP_COS_PREFIX),
            retentionDays,
            new Date(),
            target,
          );
    const removed = await deleteKeys(client, creds, expired);

    console.log(
      `[backup] ${meta.label} 完成: cos://${creds.bucket}/${key} ` +
        `压缩 ${bytes}B / 解压 ${scan.rawBytes}B / 表 ${scan.tables.length} 张 / 清理过期 ${removed} 个`,
    );
    const outcome = await sendOpsAlert(
      cfg,
      buildBackupSuccessCard({ target, key, bytes, rawBytes: scan.rawBytes, tables: scan.tables.length }),
    );
    console.log(`[backup] 成功卡片:${describeAlert(outcome)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backup] ${meta.label} 失败: ${message}`);
    if (uploadedKey) {
      await deleteKeys(client, creds, [uploadedKey]).catch(() => undefined);
    }
    await sendOpsAlert(cfg, buildBackupFailureCard({ target, reasons: [message] })).catch(
      () => undefined,
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
