/**
 * 恢复演练:把 COS 上的最新备份真恢复进一次性 MySQL 容器,逐表核对行数。
 *
 * 目的不是「跑一遍 SQL」,而是证明「备份真的能被恢复」——恢复后各锚点表的行数
 * 与备份清单里记录的行数一致才算通过。演练在**非生产机**跑(本机 Mac mini),
 * 用一次性容器,不碰生产库,演练完即销毁。
 *
 * 用法:
 *   DATABASE_URL=... tsx --conditions=react-server scripts/cron/backup-drill.ts \
 *     [--target business] [--bucket <COS 桶名>]
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

import { getConfig } from "../../src/lib/config";
import {
  BACKUP_ANCHOR_TABLES,
  BACKUP_MANIFEST_KEY,
  BACKUP_TARGET,
  type BackupTarget,
} from "../../src/constants/backup";
import {
  emptyManifest,
  latestManifestEntry,
  type BackupManifest,
} from "./backup-lib";
import { createCosClient, getBuffer, type CosCredentials } from "./backup-cos";

const IDENT_RE = /^[A-Za-z0-9_]+$/;

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`非法标识符:${name}`);
  return `\`${name}\``;
}

function run(
  cmd: string,
  args: string[],
  options: { inputFile?: string; capture?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} 退出码 ${code}: ${err.slice(0, 500)}`));
        return;
      }
      resolve(out);
    });
    if (options.inputFile) {
      createReadStream(options.inputFile).pipe(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

async function waitMysqlReady(container: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await run("docker", ["exec", container, "mysqladmin", "ping", "-uroot"]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`MySQL 容器 ${container} 未在 ${timeoutMs}ms 内就绪`);
}

async function main() {
  const rawTarget = argValue("--target") ?? BACKUP_TARGET.business;
  const target: BackupTarget =
    rawTarget === BACKUP_TARGET.wpLegacy ? BACKUP_TARGET.wpLegacy : BACKUP_TARGET.business;
  const bucketOverride = argValue("--bucket");

  const cfg = await getConfig();
  const cos = cfg.cos;
  if (!cos) throw new Error("COS 未配置(system_config 缺 cos.* 键组),演练不可用");
  const creds: CosCredentials = {
    bucket: bucketOverride || cos.bucket,
    region: cos.region,
    secretId: cos.secretId,
    secretKey: cos.secretKey,
  };
  const client = createCosClient(creds);

  const manifestBuf = await getBuffer(client, creds, BACKUP_MANIFEST_KEY);
  let manifest: BackupManifest = emptyManifest();
  if (manifestBuf) {
    try {
      const parsed = JSON.parse(manifestBuf.toString("utf8")) as BackupManifest;
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) manifest = parsed;
    } catch {
      manifest = emptyManifest();
    }
  }
  const entry = latestManifestEntry(manifest, target);
  if (!entry) throw new Error(`清单里没有 ${target} 的备份记录,无可演练对象`);

  console.log(`[drill] 演练对象: cos://${creds.bucket}/${entry.key} (备份于 ${entry.createdAt})`);

  const workDir = await mkdtemp(join(tmpdir(), "acore-drill-"));
  const sqlPath = join(workDir, "restore.sql");
  const container = `acore-backup-drill-${Date.now()}`;
  let created = false;
  try {
    const gz = await getBuffer(client, creds, entry.key);
    if (!gz) throw new Error(`COS 上取不到备份对象 ${entry.key}`);
    // 解压落盘(流式,大库不占内存)
    await pipeline(
      (async function* () {
        yield gz;
      })(),
      createGunzip(),
      createWriteStream(sqlPath),
    );

    await run("docker", [
      "run",
      "-d",
      "--name",
      container,
      "-e",
      "MYSQL_ALLOW_EMPTY_PASSWORD=1",
      "-e",
      `MYSQL_DATABASE=${entry.schema}`,
      "mysql:8.4",
      "--skip-log-bin",
    ]);
    created = true;
    await waitMysqlReady(container);

    await run("docker", ["exec", "-i", container, "mysql", "-uroot", entry.schema], {
      inputFile: sqlPath,
    });

    const restoredTables = Number(
      (
        await run("docker", [
          "exec",
          "-i",
          container,
          "mysql",
          "-uroot",
          "-N",
          "-e",
          `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${entry.schema}' AND TABLE_TYPE='BASE TABLE'`,
        ])
      ).trim(),
    );

    const failures: string[] = [];
    if (restoredTables !== entry.tables.length) {
      failures.push(`恢复后基础表数 ${restoredTables} ≠ 备份清单 ${entry.tables.length}`);
    }

    const anchorTables = Object.keys(entry.anchors).filter((t) =>
      (BACKUP_ANCHOR_TABLES[target] ?? []).includes(t),
    );
    if (anchorTables.length === 0) {
      failures.push("清单里没有可比对的锚点表行数");
    }
    for (const table of anchorTables) {
      const rows = await run("docker", [
        "exec",
        "-i",
        container,
        "mysql",
        "-uroot",
        "-N",
        "-e",
        `SELECT COUNT(*) FROM ${quoteIdent(entry.schema)}.${quoteIdent(table)}`,
      ]);
      const actual = Number(rows.trim());
      const expected = entry.anchors[table];
      const mark = actual === expected ? "✓" : "✗";
      console.log(`[drill]   ${mark} ${table}: 期望 ${expected} / 实际 ${actual}`);
      if (actual !== expected) failures.push(`${table} 行数 ${actual} ≠ 备份时 ${expected}`);
    }

    if (failures.length > 0) {
      console.error(`[drill] 演练失败:\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `[drill] 演练通过: ${entry.target} 备份可恢复(${restoredTables} 张表 / ` +
        `${anchorTables.length} 个锚点表行数一致)`,
    );
  } finally {
    if (created) {
      await run("docker", ["rm", "-f", container]).catch(() => undefined);
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((err) => {
  console.error(`[drill] 失败: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
