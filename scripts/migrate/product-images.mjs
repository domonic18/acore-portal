// 存量商品图片/描述回填(2026-10-26 用户指令:商品图片与 WP 对齐)
// 来源:wp_legacy wp_postmeta _thumbnail_id(featured image)+ post_content 内嵌 <img>;
//   经 image_asset_map(cos-upload 已建,oldUrl 幂等键)重写为 CDN 直链写入 product.images
//   (首图=featured,其后=正文图去重);description 字面量 \n 归一为真换行。
// detailMd 不回填(保持 NULL=详情页回退简介,由运营用 Markdown 编辑器逐步补写)。
// 用法:DATABASE_URL=mysql://… node scripts/migrate/product-images.mjs [--dry-run]
// 幂等:images 已有内容的商品跳过;description 归一天然幂等,可重复跑。
const OLD_URL_MARK = "/wp-content/uploads/";
const IMG_SRC_RE = /<img[^>]*?\ssrc=["']([^"']+)["']/gi;

/** 任意旧站 URL/路径 → 归一 oldUrl(/wp-content/uploads/…);非旧站图返回 null */
function normalizeOldUrl(src) {
  const mark = src.indexOf(OLD_URL_MARK);
  if (mark === -1) return null;
  let oldUrl = decodeURIComponent(src.slice(mark));
  oldUrl = oldUrl.split("#")[0];
  return oldUrl;
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

  const [products] = await pool.query(
    `SELECT id, legacy_wp_product_id, description FROM product
     WHERE legacy_wp_product_id IS NOT NULL
       AND (images IS NULL OR JSON_LENGTH(images) = 0)`,
  );
  console.log(`待回填商品:${products.length}`);

  let withFeatured = 0;
  let withContentImg = 0;
  let unmapped = 0;
  let descFixed = 0;
  let updated = 0;

  for (const p of products) {
    const urls = [];
    // featured image(全部 99 存量商品都有 _thumbnail_id,缺失仅告警)
    const [[thumb]] = await pool.query(
      `SELECT meta_value FROM wp_legacy.wp_postmeta WHERE post_id = ? AND meta_key = '_thumbnail_id'`,
      [p.legacy_wp_product_id],
    );
    if (thumb) {
      const [[att]] = await pool.query(
        `SELECT guid FROM wp_legacy.wp_posts WHERE ID = ? AND post_type = 'attachment'`,
        [thumb.meta_value],
      );
      const oldUrl = att ? normalizeOldUrl(att.guid) : null;
      if (oldUrl) {
        const [[map]] = await pool.query(
          `SELECT new_url FROM image_asset_map WHERE old_url = ?`,
          [oldUrl],
        );
        if (map) urls.push(map.new_url);
        else unmapped += 1;
      } else if (att) {
        unmapped += 1;
      }
    } else {
      console.warn(`  商品 ${p.id}(legacy ${p.legacy_wp_product_id})无 _thumbnail_id`);
    }

    // 正文内嵌图(旧站详情正文即带图 HTML,迁移时被剥离;此处找回)
    const [[content]] = await pool.query(
      `SELECT post_content FROM wp_legacy.wp_posts WHERE ID = ?`,
      [p.legacy_wp_product_id],
    );
    if (content) {
      for (const m of content.post_content.matchAll(IMG_SRC_RE)) {
        const oldUrl = normalizeOldUrl(m[1]);
        if (!oldUrl) continue;
        const [[map]] = await pool.query(`SELECT new_url FROM image_asset_map WHERE old_url = ?`, [
          oldUrl,
        ]);
        if (map && !urls.includes(map.new_url)) {
          urls.push(map.new_url);
          withContentImg += 1;
        } else if (!map) {
          unmapped += 1;
        }
      }
    }
    if (urls.length > 0) withFeatured += 1;

    // description 字面量 \n 归一(迁移产物;真换行不受影响,天然幂等)
    const desc = typeof p.description === "string" ? p.description : "";
    const nextDesc = desc.split("\\n").join("\n");

    if (urls.length === 0 && nextDesc === desc) continue;
    updated += 1;
    if (!dryRun) {
      await pool.query(
        `UPDATE product SET images = ?, description = ? WHERE id = ?`,
        [JSON.stringify(urls), nextDesc, p.id],
      );
    }
    console.log(
      `  商品 ${p.id}:图片 ${urls.length} 张${desc !== nextDesc ? "+描述归一" : ""}`,
    );
  }

  console.log(
    `完成:dry_run=${dryRun} 更新 ${updated} 商品(带主图 ${withFeatured},正文补充图 ${withContentImg}),映射缺失 ${unmapped} 处`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
