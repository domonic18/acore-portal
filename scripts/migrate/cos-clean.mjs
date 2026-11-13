// 演练前 COS 现役桶盘点与重置(2026-11-11 全链演练;切换日亦复用)
// 用法:
//   node scripts/migrate/cos-clean.mjs [--uploads-dir <dir>]   # dry-run:分类盘点,零删除
//   node scripts/migrate/cos-clean.mjs --yes [...]             # 执行删除(仅镜像键空间类)
// 配置:cos.* 五键读目标库 system_config(与 cos-upload.mjs 同源,MIGRATE_DATABASE_URL 优先)
// 分类口径:wp 类 = uploads 镜像内会真上传的键(与 cos-upload 键空间逐键一致,
// 不靠「年/月目录」等启发式——实测 149 个顶层/自定义路径文件会被启发式漏判);
// `backups/db/`(测试栈每日备份)与 `media/`(运行期上传)硬编码排除,永不删除
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, createPool } from "./lib/db.mjs";
import { loadCosConfig } from "./cos-upload.mjs";

const PROTECTED = [
  { prefix: "backups/db/", cls: "backup", note: "测试栈每日备份(永不删)" },
  { prefix: "media/", cls: "runtime", note: "运行期上传(不删)" },
];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".pdf", ".css"]);
const EXCLUDE_DIRS = new Set(["db-backup"]);
const DEFAULT_UPLOADS_DIR = path.join(homedir(), "Code/lokta/files/wordpress/wp-content/uploads");

/** 与 cos-upload.walkFiles 同口径(扩展名白名单 + 排除目录),只收键不读内容 */
async function collectUploadKeys(dir) {
  const keys = new Set();
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        await walk(path.join(d, entry.name));
      } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
        keys.add(path.relative(dir, path.join(d, entry.name)).split(path.sep).join("/"));
      }
    }
  }
  await walk(dir);
  return keys;
}

function parseArgs(argv) {
  const opts = { yes: false, uploadsDir: DEFAULT_UPLOADS_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--yes") opts.yes = true;
    else if (argv[i] === "--uploads-dir") opts.uploadsDir = argv[++i];
  }
  return opts;
}

function classify(key, uploadKeys) {
  for (const p of PROTECTED) if (key.startsWith(p.prefix)) return p.cls;
  if (uploadKeys.has(key)) return "wp";
  return "other";
}

async function listAll(client, bucket, region) {
  const keys = [];
  let marker;
  for (;;) {
    const res = await new Promise((resolve, reject) =>
      client.getBucket(
        { Bucket: bucket, Region: region, Prefix: "", Marker: marker, MaxKeys: 1000 },
        (err, data) => (err ? reject(err) : resolve(data)),
      ),
    );
    for (const item of res.Contents ?? []) keys.push({ key: item.Key, size: Number(item.Size ?? 0) });
    // XML 解析出的 IsTruncated 是字符串("false" 为 truthy),必须显式比对
    if (String(res.IsTruncated) !== "true") break;
    marker = res.NextMarker;
  }
  return keys;
}

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));
  const pool = createPool();
  try {
    const config = await loadCosConfig(pool);
    const missing = ["cos.bucket", "cos.region", "cos.secretId", "cos.secretKey"].filter((k) => !config[k]);
    if (missing.length > 0) throw new Error(`COS 配置缺失(${missing.join(",")})`);

    const uploadKeys = await collectUploadKeys(opts.uploadsDir);

    const { default: COS } = await import("cos-nodejs-sdk-v5");
    const client = new COS({ SecretId: config["cos.secretId"], SecretKey: config["cos.secretKey"] });
    const bucket = config["cos.bucket"];
    const region = config["cos.region"];

    console.log(
      `桶: ${bucket}(${region}) · 模式: ${opts.yes ? "!! 真删除 !!" : "dry-run(零删除)"}` +
        ` · uploads 镜像键 ${uploadKeys.size} 个(${opts.uploadsDir})`,
    );
    const objects = await listAll(client, bucket, region);

    const byClass = { wp: [], backup: [], runtime: [], other: [] };
    for (const o of objects) byClass[classify(o.key, uploadKeys)].push(o);

    for (const [cls, list] of Object.entries(byClass)) {
      const bytes = list.reduce((sum, o) => sum + o.size, 0);
      console.log(
        `[${cls}] ${list.length} 个对象 / ${(bytes / 1024 / 1024).toFixed(1)}MB` +
          (cls === "backup" || cls === "runtime" ? " · 受保护,不删" : cls === "other" ? " · 非迁移键空间,不删(仅报告)" : " · 将删除"),
      );
      for (const o of list.slice(0, 3)) console.log(`    例: ${o.key}(${o.size}B)`);
    }

    if (!opts.yes) {
      console.log(`\ndry-run 结束:镜像键空间类 ${byClass.wp.length} 个待删;确认无误后加 --yes 执行。`);
      return;
    }
    if (byClass.wp.length === 0) {
      console.log("\n无镜像键空间对象,零删除。");
      return;
    }
    let deleted = 0;
    for (let i = 0; i < byClass.wp.length; i += 1000) {
      const batch = byClass.wp.slice(i, i + 1000).map((o) => ({ Key: o.key }));
      await new Promise((resolve, reject) =>
        client.deleteMultipleObject(
          { Bucket: bucket, Region: region, Objects: batch },
          (err) => (err ? reject(err) : resolve()),
        ),
      );
      deleted += batch.length;
      console.log(`已删除 ${deleted}/${byClass.wp.length}`);
    }
    console.log(`\n清理完成:删除镜像键空间 ${deleted} 个;backups/db/ 与 media/ 未触碰。`);
  } finally {
    await pool.end();
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((err) => {
    console.error(`[cos-clean] ${err.message}`);
    process.exit(1);
  });
}
