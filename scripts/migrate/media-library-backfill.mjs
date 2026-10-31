// 媒体库回填(2026-10-26 用户反馈:商品配图「从媒体库选择」为空):
// 旧站图片经 cos-upload 只写了 image_asset_map,从未进 media_asset(新媒体库仅
// 收运行期上传),导致后台选图弹层无图可挑。本脚本把 image_asset_map 中的图片
// (按扩展名 image/*;pdf 同为白名单类型)回填为 media_asset 行:
//   cosKey=新 URL 路径段(如 2022/12/1-100x100.png),originalName=旧 URL 文件名
//   (运营可按旧站文件名搜索),sizeBytes=0(远端已有对象,不回源测量),
//   uploadedBy=m1admin。
// 分类(2026-10-26 用户反馈:媒体库平铺无分类):对齐旧站 FileBird 文件夹
//   (wp_fbv/wp_fbv_attachment_folder),按附件→一级文件夹名归档(坐骑/公共等
//   子文件夹归并顶级;缩略图变体 -WxH/-scaled 继承原图);无归档 → 其他。
// cosKey 唯一键 + ON DUPLICATE KEY UPDATE:重复执行零增量,且存量行分类可被刷新。
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
const DEFAULT_CATEGORY = "其他";

/** 任意旧站 URL/路径 → 归一路径(/wp-content/uploads/…);与 product-images.mjs 同口径 */
function pathKey(url) {
  const mark = url.indexOf("/wp-content/uploads/");
  if (mark === -1) return null;
  try {
    return decodeURIComponent(url.slice(mark));
  } catch {
    return url.slice(mark);
  }
}

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

  const [[admin]] = await pool.query(`SELECT id FROM user WHERE username = 'm1admin' LIMIT 1`);
  if (!admin) throw new Error("m1admin 用户不存在,无法回填(uploadedBy 外键)");

  // FileBird 附件分类:attachment_id → 一级文件夹名
  const [attachments] = await pool.query(
    `SELECT ID, guid FROM wp_legacy.wp_posts WHERE post_type = 'attachment'`,
  );
  const [folders] = await pool.query(`SELECT id, parent, name FROM wp_legacy.wp_fbv`);
  const [links] = await pool.query(
    `SELECT folder_id, attachment_id FROM wp_legacy.wp_fbv_attachment_folder`,
  );
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const folderOfAttachment = new Map(links.map((l) => [l.attachment_id, l.folder_id]));
  function rootFolderName(attachmentId) {
    let f = folderById.get(folderOfAttachment.get(attachmentId));
    while (f && f.parent !== 0) f = folderById.get(f.parent);
    return f?.name ?? null;
  }
  const categoryByPath = new Map();
  const categoryByBase = new Map(); // 文件名兜底:WP 生成变体可能落在与附件登记不同的月份目录
  const base = (p) => p.split("/").pop() ?? "";
  for (const a of attachments) {
    const key = pathKey(a.guid);
    const name = rootFolderName(a.ID);
    if (!key || !name) continue;
    categoryByPath.set(key, name);
    if (!categoryByBase.has(base(key))) categoryByBase.set(base(key), name);
  }
  // 变体继承原图分类:1-100x100.png / 1-scaled.jpg / 图-e1694238824439.png(Elementor 派生尺寸)
  const categoryOf = (oldUrl) => {
    const name = base(oldUrl);
    return (
      categoryByPath.get(oldUrl) ??
      categoryByPath.get(oldUrl.replace(/-(?:\d+x\d+|scaled)(\.\w+)$/i, "$1")) ??
      categoryByBase.get(name) ??
      categoryByBase.get(name.replace(/-(?:\d+x\d+|scaled|e\d+)(\.\w+)$/i, "$1")) ??
      DEFAULT_CATEGORY
    );
  };

  const [maps] = await pool.query(`SELECT old_url, new_url FROM image_asset_map`);
  const seenCosKey = new Set();
  const rows = [];
  let skippedMime = 0;
  let skippedTooLong = 0;
  const categoryCount = new Map();
  for (const m of maps) {
    const mime = MIME_BY_EXT[m.new_url.slice(m.new_url.lastIndexOf(".")).toLowerCase()];
    if (!mime) {
      skippedMime += 1;
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
    const category = categoryOf(m.old_url);
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    rows.push([cosKey, m.new_url, originalName, category, 0, mime, admin.id]);
  }

  console.log(
    `映射 ${maps.length} 条:回填/刷新 ${rows.length},非白名单类型 ${skippedMime},超长/无名 ${skippedTooLong}`,
  );
  console.log(
    `分类分布:${[...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`)
      .join(",")}`,
  );
  if (!dryRun) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await pool.query(
        `INSERT INTO media_asset (cos_key, url, original_name, category, size_bytes, mime_type, uploaded_by)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}
         ON DUPLICATE KEY UPDATE original_name = VALUES(original_name), category = VALUES(category)`,
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
