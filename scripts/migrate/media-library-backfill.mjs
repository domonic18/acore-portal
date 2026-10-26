// 媒体库回填(2026-10-26 用户反馈:商品配图「从媒体库选择」为空):
// 旧站图片经 cos-upload 只写了 image_asset_map,从未进 media_asset(新媒体库仅
// 收运行期上传),导致后台选图弹层无图可挑。本脚本把 image_asset_map 中的图片
// (按扩展名 image/*;pdf 同为白名单类型)回填为 media_asset 行:
//   cosKey=新 URL 路径段(如 2022/12/1-100x100.png),originalName=旧 URL 文件名
//   (运营可按旧站文件名搜索),sizeBytes=0(远端已有对象,不回源测量),
//   uploadedBy=m1admin。url 天然幂等键,可重复跑。
// 用法:DATABASE_URL=mysql://… node scripts/migrate/media-library-backfill.mjs [--dry-run]
const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { config } = await import("dotenv");
  config({ path: new URL("../../.env", import.meta.url).pathname });
  const { createPool } = await import("mysql2/promise");
  const url = new URL(process.env.DATABASE_URL);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 2,
    charset: "utf8mb4",
  });

  const [[admin]] = await pool.query(
    `SELECT id FROM user WHERE username = 'm1admin' LIMIT 1`,
  );
  if (!admin) throw new Error("m1admin 用户不存在,无法回填(uploadedBy 外键)");
  const [[existing]] = await pool.query(`SELECT COUNT(*) AS n FROM media_asset`);
  const knownUrls = new Set(
    (await pool.query(`SELECT url FROM media_asset`))[0].map((r) => r.url),
  );

  const [maps] = await pool.query(`SELECT old_url, new_url FROM image_asset_map`);
  const seenCosKey = new Set();
  const rows = [];
  let skippedMime = 0;
  let skippedExisting = 0;
  let skippedTooLong = 0;
  for (const m of maps) {
    const mime = MIME_BY_EXT[m.new_url.slice(m.new_url.lastIndexOf(".")).toLowerCase()];
    if (!mime) {
      skippedMime += 1;
      continue;
    }
    if (knownUrls.has(m.new_url)) {
      skippedExisting += 1;
      continue;
    }
    const cosKey = decodeURIComponent(new URL(m.new_url).pathname.slice(1));
    const originalName = decodeURIComponent(m.old_url.split("/").pop() ?? "");
    if (cosKey.length > 255 || originalName.length === 0 || originalName.length > 255) {
      skippedTooLong += 1;
      continue;
    }
    if (seenCosKey.has(cosKey)) continue;
    seenCosKey.add(cosKey);
    rows.push([cosKey, m.new_url, originalName, 0, mime, admin.id]);
  }

  console.log(
    `映射 ${maps.length} 条:回填 ${rows.length},已在库 ${skippedExisting},非白名单类型 ${skippedMime},超长/无名 ${skippedTooLong}`,
  );
  if (!dryRun) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await pool.query(
        `INSERT INTO media_asset (cos_key, url, original_name, size_bytes, mime_type, uploaded_by)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        chunk.flat(),
      );
    }
  }
  console.log(`完成:dry_run=${dryRun}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
