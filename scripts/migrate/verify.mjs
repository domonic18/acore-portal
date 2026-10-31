// 图片资产三方对账(2026-10-26 媒体库空库事故的落地防线):
// 事故:cos-upload 只写 image_asset_map(迁移台账),应用媒体库读 media_asset,
//   无人对账,后台「从媒体库选择」空库才暴露。本脚本把裂缝前移到跑完即报。
// 检查项:
//   A. FAIL 台账→媒体库:image_asset_map 中白名单类型(image/*+pdf)的每一行,
//      media_asset.url 必须存在(缺=媒体库回填不完整,后台不可管理/重选)
//   B. WARN 商品图无台账:product.images 的 URL 既不在 media_asset 也不在
//      image_asset_map → 外链或手工填入,人工确认是否有意
//   C. WARN 存量商品零图:legacy_wp_product_id 非空且 images 为空 → 旧站 99/99
//      均有主图,出现零图即回填遗漏候选
// 退出码:存在 FAIL → 1(拦截交付);仅 WARN → 0(不拦截,须人工过目)。
// 幂等只读;用法:DATABASE_URL=mysql://… node scripts/migrate/verify.mjs
const MIME_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif", ".ico", ".pdf",
]);
const SAMPLE_LIMIT = 5;

function isWhitelisted(url) {
  const dot = url.lastIndexOf(".");
  if (dot === -1) return false;
  return MIME_EXTS.has(url.slice(dot).toLowerCase());
}

async function main() {
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

  let fail = 0;
  let warn = 0;

  // A. 台账 → 媒体库(缺行即 FAIL)
  const [maps] = await pool.query(`SELECT new_url FROM image_asset_map`);
  const [media] = await pool.query(`SELECT url FROM media_asset`);
  const mediaUrls = new Set(media.map((r) => r.url));
  const mapUrls = new Set(maps.map((r) => r.new_url));
  const missingInMedia = maps.filter((m) => isWhitelisted(m.new_url) && !mediaUrls.has(m.new_url));
  if (missingInMedia.length > 0) {
    fail += 1;
    console.log(
      `FAIL A 台账→媒体库缺 ${missingInMedia.length} 行(先跑 media-library-backfill.mjs),样例:`,
    );
    for (const m of missingInMedia.slice(0, SAMPLE_LIMIT)) console.log(`    ${m.new_url}`);
  } else {
    console.log(
      `PASS A 台账→媒体库:${maps.length} 行映射,白名单类型全部在库(媒体库共 ${media.length})`,
    );
  }

  // B. 商品图 → 台账/媒体库(双缺即 WARN,外链或手工填入)
  const [products] = await pool.query(`SELECT id, slug, images FROM product`);
  const untracked = [];
  let withImages = 0;
  for (const p of products) {
    let urls = [];
    try {
      const parsed = JSON.parse(typeof p.images === "string" ? p.images : JSON.stringify(p.images ?? []));
      if (Array.isArray(parsed)) urls = parsed.filter((u) => typeof u === "string");
    } catch {
      warn += 1;
      console.log(`WARN B 商品 ${p.id}(${p.slug})images 非 JSON 数组,人工检查`);
      continue;
    }
    if (urls.length > 0) withImages += 1;
    for (const u of urls) {
      if (!mediaUrls.has(u) && !mapUrls.has(u)) untracked.push({ id: p.id, slug: p.slug, url: u });
    }
  }
  if (untracked.length > 0) {
    warn += 1;
    console.log(`WARN B 商品图无台账 ${untracked.length} 处(外链/手工填入,确认是否有意),样例:`);
    for (const u of untracked.slice(0, SAMPLE_LIMIT)) console.log(`    商品 ${u.id}(${u.slug})${u.url}`);
  } else {
    console.log(`PASS B 商品图全部有台账(media_asset 或 image_asset_map),配图商品 ${withImages} 个`);
  }

  // C. 存量商品零图(旧站均有主图,零图=回填遗漏候选)
  const [[{ legacyZero }]] = await pool.query(
    `SELECT COUNT(*) AS legacyZero FROM product
     WHERE legacy_wp_product_id IS NOT NULL
       AND (images IS NULL OR JSON_LENGTH(images) = 0)`,
  );
  if (legacyZero > 0) {
    warn += 1;
    console.log(`WARN C 存量商品零图 ${legacyZero} 个(旧站均有主图,疑回填遗漏),样例:`);
    const [rows] = await pool.query(
      `SELECT id, slug FROM product
       WHERE legacy_wp_product_id IS NOT NULL AND (images IS NULL OR JSON_LENGTH(images) = 0)
       LIMIT ${SAMPLE_LIMIT}`,
    );
    for (const r of rows) console.log(`    商品 ${r.id}(${r.slug})`);
  } else {
    console.log(`PASS C 存量商品零图 0 个`);
  }

  console.log(`对账结束:FAIL ${fail},WARN ${warn} → 退出码 ${fail > 0 ? 1 : 0}`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
