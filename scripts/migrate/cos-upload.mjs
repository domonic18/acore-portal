// 旧站 uploads → COS/CDN 迁移(US6 T060;FR-132;quickstart S6.5)
// 用法:
//   node scripts/migrate/cos-upload.mjs [--uploads-dir <dir>] [--scan-only]
// 默认 uploads 目录:~/Code/lokta/files/wordpress/wp-content/uploads
// --scan-only:演练/无凭据模式——只扫描建映射(newUrl=cdnBase+key)+死链报告,零上传
// 幂等:image_asset_map.oldUrl unique;fileHash 相同跳过上传(重复跑零上传,验收红线)
// 配置:cos.* 五键走业务库 system_config(宪法 VI;凭据不入 env/文档/日志)
// 死链扫描:wp_posts.post_content 里的 /wp-content/uploads/ 引用 → 逐一核对映射覆盖
import { config as dotenvConfig } from "dotenv";
import { createPool } from "mysql2/promise";
import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 扫描白名单:图片扩展 + 存量正文实际引用到的 .css(UC 轮播 animate.css,死链扫描实证)
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".pdf", ".css"]);
const EXCLUDE_DIRS = new Set(["db-backup"]);
const OLD_URL_PREFIX = "/wp-content/uploads/";

async function* walkFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      yield* walkFiles(path.join(dir, entry.name));
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      yield path.join(dir, entry.name);
    }
  }
}

/** 扫描 uploads:返回 [{ relPath, oldUrl, absPath, sha256 }] */
export async function scanUploads(uploadsDir) {
  const out = [];
  for await (const absPath of walkFiles(uploadsDir)) {
    const relPath = path.relative(uploadsDir, absPath).split(path.sep).join("/");
    const buf = await readFile(absPath);
    out.push({
      relPath,
      oldUrl: OLD_URL_PREFIX + relPath,
      absPath,
      sha256: createHash("sha256").update(buf).digest("hex"),
    });
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** 读取 system_config 的 cos.* 五键(缺失返回 null,配合 --scan-only) */
export async function loadCosConfig(pool) {
  const [rows] = await pool.query(
    `SELECT \`key\`, value FROM system_config WHERE \`key\` IN
       ('cos.bucket','cos.region','cos.secretId','cos.secretKey','cos.cdnBase')`,
  );
  const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!flat["cos.bucket"] || !flat["cos.region"] || !flat["cos.cdnBase"]) return null;
  return {
    bucket: flat["cos.bucket"],
    region: flat["cos.region"],
    secretId: flat["cos.secretId"] ?? "",
    secretKey: flat["cos.secretKey"] ?? "",
    cdnBase: flat["cos.cdnBase"].replace(/\/?$/, ""),
  };
}

/**
 * 幂等上传 + 映射回填。返回 { scanned, uploaded, skippedHash, mapped, missingConfig }。
 */
export async function uploadAndMap(pool, uploadsDir, { scanOnly = false } = {}) {
  const cos = await loadCosConfig(pool);
  const files = await scanUploads(uploadsDir);

  if (!scanOnly && !cos) {
    // 凭据缺失时不失败退出:按演练口径只回填映射与报告(死链扫描依赖映射行)
    scanOnly = true;
  }
  let client;
  if (!scanOnly) {
    const { default: COS } = await import("cos-nodejs-sdk-v5");
    client = new COS({ SecretId: cos.secretId, SecretKey: cos.secretKey });
  }

  let uploaded = 0;
  let skippedHash = 0;
  for (const f of files) {
    const [existing] = await pool.query(
      `SELECT file_hash FROM image_asset_map WHERE old_url = ?`,
      [f.oldUrl],
    );
    if (existing[0]?.file_hash === f.sha256) {
      skippedHash++;
      continue;
    }
    if (!scanOnly) {
      await client.putObject({
        Bucket: cos.bucket,
        Region: cos.region,
        Key: f.relPath,
        Body: await readFile(f.absPath),
      });
      uploaded++;
    }
    const newUrl = `${(cos?.cdnBase ?? "").replace(/\/?$/, "")}/${f.relPath}`;
    await pool.query(
      `INSERT INTO image_asset_map (old_url, new_url, file_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE new_url = VALUES(new_url), file_hash = VALUES(file_hash)`,
      [f.oldUrl, newUrl, f.sha256],
    );
  }

  // 映射行覆盖=scanned(skippedHash 的文件首跑已建行;本轮跳过上传但仍覆盖)
  return {
    scanned: files.length,
    uploaded: scanOnly ? 0 : uploaded,
    skippedHash,
    mapped: files.length,
    scanOnly,
  };
}

/**
 * 死链扫描:存量帖子内容里的旧 uploads 引用,逐一经映射表核对。
 * 返回 { posts, refs, covered, deadlinks: [{ postId, url }] }
 */
export async function scanDeadlinks(pool) {
  const [posts] = await pool.query(
    `SELECT ID, post_content FROM wp_legacy.wp_posts
     WHERE post_content LIKE '%/wp-content/uploads/%' AND post_status = 'publish'`,
  );
  const [mapRows] = await pool.query(`SELECT old_url FROM image_asset_map`);
  const mapped = new Set(mapRows.map((r) => r.old_url));
  const refs = new Map(); // url -> postId(首个)
  for (const p of posts) {
    const urls = String(p.post_content).match(
      /https?:\/\/[^"'\s>]+\/wp-content\/uploads\/[^"'\s>)]+|\/wp-content\/uploads\/[^"'\s>)]+/g,
    );
    for (const raw of urls ?? []) {
      const url = raw.replace(/^https?:\/\/[^/]+/, "");
      if (!refs.has(url)) refs.set(url, p.ID);
    }
  }
  const deadlinks = [...refs.entries()]
    .filter(([url]) => !mapped.has(url))
    .map(([url, postId]) => ({ postId, url }));
  return { posts: posts.length, refs: refs.size, covered: refs.size - deadlinks.length, deadlinks };
}

// ---- CLI 入口(vitest 导入时不执行) ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenvConfig({ path: new URL("../../.env", import.meta.url).pathname });
  const args = process.argv.slice(2);
  const scanOnly = args.includes("--scan-only");
  const dirIdx = args.indexOf("--uploads-dir");
  const uploadsDir =
    dirIdx >= 0
      ? args[dirIdx + 1]
      : path.join(homedir(), "Code/lokta/files/wordpress/wp-content/uploads");
  const s = await stat(uploadsDir).catch(() => null);
  if (!s?.isDirectory()) {
    console.error(`uploads 目录不存在: ${uploadsDir}(--uploads-dir 指定)`);
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 2,
  });
  const up = await uploadAndMap(pool, uploadsDir, { scanOnly });
  const dead = await scanDeadlinks(pool);
  console.log(JSON.stringify({ uploadsDir, ...up, deadlinks: dead }, null, 2));
  await pool.end();
}
