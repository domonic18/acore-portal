// 业务库每日备份 + 游戏四库每周备份 → 腾讯云 COS(M4 US5 T033;FR-317;research R10)
// 用法:
//   node scripts/cron/backup.mjs [--force-weekly]
//   --force-weekly:调试参数,非周日也触发游戏四库 dump(quickstart S5.6 手动验证口径)
// 数据链:
//   .env(DATABASE_URL)→ system_config(cos.*/backup.*/gamedb.*)
//   → docker exec {BACKUP_MYSQL_CONTAINER} mysqldump → gzip
//   → COS backups/db/{name}-{yyyyMMdd}.sql.gz → 保留期清理(backup.retentionDays,0=只留当日)
// 容器口径:mysqldump 在业务 MySQL 容器内执行(宿主无需装 client);
//   业务库用 DATABASE_URL 账号(容器内 -h127.0.0.1 直连本机);
//   游戏四库走 system_config gamedb.* 连接串原样 host/port(localhost 归一为 127.0.0.1+3306:
//   容器内 localhost 走 socket 且指向业务库自身,同机部署的游戏 schema 恰在同实例;
//   跨机部署须保证业务 MySQL 容器可网达游戏库,两种客户端路径见 docs/ops/backup-restore.md)
// 凭据治理:密钥只在内存,不打印不落日志;任何 stderr/错误回显先按密码串脱敏(宪法 VI)
import { config as dotenvConfig } from "dotenv";
import { execFile } from "node:child_process";
import { gzipSync } from "node:zlib";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
dotenvConfig({ path: new URL("../../.env", import.meta.url).pathname });

const COS_PREFIX = "backups/db/";

function todayStamp(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseMysqlUrl(raw) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    name: url.pathname.replace(/^\//, ""),
  };
}

async function loadRuntimeConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置(.env)");
  }
  const { createPool } = await import("mysql2/promise");
  const pool = createPool({ uri: databaseUrl, connectionLimit: 2 });
  try {
    const [rows] = await pool.query(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'cos.%' OR `key` LIKE 'backup.%' OR `key` LIKE 'gamedb.%'",
    );
    const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const cos = flat["cos.bucket"] && flat["cos.region"]
      ? {
          bucket: flat["cos.bucket"],
          region: flat["cos.region"],
          secretId: flat["cos.secretId"] ?? "",
          secretKey: flat["cos.secretKey"] ?? "",
        }
      : null;
    const gamedb = {};
    for (const name of ["auth", "characters", "world", "eluna"]) {
      const raw = flat[`gamedb.${name}`];
      if (raw) gamedb[name] = parseMysqlUrl(raw);
    }
    return {
      db: parseMysqlUrl(databaseUrl),
      cos,
      backup: {
        retentionDays: Number(flat["backup.retentionDays"] ?? "30"),
        gameWeekly: flat["backup.gameWeekly"] !== "false",
      },
      gamedb,
    };
  } finally {
    await pool.end();
  }
}

function redact(text, secrets) {
  let out = text;
  for (const s of secrets) {
    if (s) out = out.replaceAll(s, "***");
  }
  return out;
}

/** 容器内 mysqldump(encoding:buffer 二进制安全;stderr 仅有密码告警时不视为失败) */
async function dumpDatabase(container, args, secrets) {
  try {
    const { stdout, stderr } = await execFileP(
      "docker",
      ["exec", container, "mysqldump", ...args],
      { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 },
    );
    if (stderr.length > 0) {
      console.error(`[backup] mysqldump 警告: ${redact(stderr.toString("utf8"), secrets).trim()}`);
    }
    return stdout;
  } catch (err) {
    const e = err;
    const detail = [
      e.message,
      e.stdout ? e.stdout.toString("utf8") : "",
      e.stderr ? e.stderr.toString("utf8") : "",
    ]
      .join("\n")
      .slice(0, 1000);
    throw new Error(`mysqldump 失败: ${redact(detail, secrets)}`);
  }
}

function businessDumpArgs(db) {
  return [
    "-h127.0.0.1",
    "-P3306",
    "-u",
    db.user,
    `-p${db.password}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    // MySQL 8 非特权账号 dump tablespaces 会报 PROCESS 权限错(恢复不需要该信息)
    "--no-tablespaces",
    db.name,
  ];
}

/** 游戏库 dump 参数:localhost 归一 127.0.0.1+3306(容器内同实例),其余 host/port 原样 */
function gameDumpArgs(target) {
  const sameInstance = target.host === "localhost" || target.host === "127.0.0.1";
  return [
    "-h" + (sameInstance ? "127.0.0.1" : target.host),
    "-P" + (sameInstance ? "3306" : target.port),
    "-u",
    target.user,
    `-p${target.password}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    "--no-tablespaces",
    target.name,
  ];
}

async function uploadToCos(cos, key, body) {
  const { default: COS } = await import("cos-nodejs-sdk-v5");
  const client = new COS({ SecretId: cos.secretId, SecretKey: cos.secretKey });
  await client.putObject({ Bucket: cos.bucket, Region: cos.region, Key: key, Body: body });
}

/** 保留期清理:解析文件名日期,早于「今日零点 - retentionDays」的删除(retentionDays=0=只留当日) */
async function retentionCleanup(cos, retentionDays) {
  const { default: COS } = await import("cos-nodejs-sdk-v5");
  const client = new COS({ SecretId: cos.secretId, SecretKey: cos.secretKey });
  const listed = await client.getBucket({ Bucket: cos.bucket, Region: cos.region, Prefix: COS_PREFIX });
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const cutoff = midnight.getTime() - retentionDays * 86400_000;
  const victims = (listed.Contents ?? []).filter((c) => {
    const m = /-(\d{8})\.sql\.gz$/.exec(c.Key);
    if (!m) return false;
    const ts = Date.parse(
      `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T00:00:00+08:00`,
    );
    return ts < cutoff;
  });
  if (victims.length > 0) {
    await client.deleteMultipleObject({
      Bucket: cos.bucket,
      Region: cos.region,
      Objects: victims.map((v) => ({ Key: v.Key })),
    });
  }
  return victims.map((v) => v.Key);
}

async function main() {
  const forceWeekly = process.argv.includes("--force-weekly");
  const container = process.env.BACKUP_MYSQL_CONTAINER || "acore-portal-test-mysql-1";
  const cfg = await loadRuntimeConfig();
  const secrets = [
    cfg.db.password,
    ...Object.values(cfg.gamedb).map((g) => g.password),
    cfg.cos?.secretKey,
    cfg.cos?.secretId,
  ];
  if (!cfg.cos) {
    throw new Error("COS 未配置(system_config 缺少 cos.* 键组),备份不可用");
  }

  // 1. 业务库每日备份
  const stamp = todayStamp();
  const businessKey = `${COS_PREFIX}lokta-business-${stamp}.sql.gz`;
  const businessDump = await dumpDatabase(container, businessDumpArgs(cfg.db), secrets);
  await uploadToCos(cfg.cos, businessKey, gzipSync(businessDump, { level: 6 }));
  console.log(
    `[backup] 业务库完成: cos://${cfg.cos.bucket}/${businessKey} (raw ${(businessDump.length / 1024).toFixed(0)}KB)`,
  );

  // 2. 游戏四库周备(周日 或 --force-weekly;单库失败不中断其余库,最终非零退出)
  const isSunday = new Date().getDay() === 0;
  const failedGames = [];
  if (cfg.backup.gameWeekly && (isSunday || forceWeekly)) {
    for (const [name, target] of Object.entries(cfg.gamedb)) {
      const key = `${COS_PREFIX}lokta-${name}-${stamp}.sql.gz`;
      try {
        const dump = await dumpDatabase(container, gameDumpArgs(target), secrets);
        await uploadToCos(cfg.cos, key, gzipSync(dump, { level: 6 }));
        console.log(`[backup] 游戏库 ${name} 完成: cos://${cfg.cos.bucket}/${key}`);
      } catch (err) {
        failedGames.push(name);
        console.error(`[backup] 游戏库 ${name} 失败: ${err instanceof Error ? err.message : err}`);
      }
    }
  } else {
    console.log("[backup] 非周日且未 --force-weekly,跳过游戏四库周备");
  }

  // 3. 保留期清理
  const removed = await retentionCleanup(cfg.cos, cfg.backup.retentionDays);
  console.log(
    `[backup] 保留期清理(retentionDays=${cfg.backup.retentionDays}): 删除 ${removed.length} 个过期对象`,
  );

  if (failedGames.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[backup] 失败: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
