// 迁移链编排器 + 演练入口(2026-11-07 迁移就绪度收口):
//
// 此前迁移是一条"按记忆手工依次执行"的链:十几个脚本、顺序有真实依赖
// (route-map-m3 的 topic/forum 两键读论坛表 → 必须晚于 forum-import;slug 归一必须
// 紧跟商城导入),却没有任何一处写着权威顺序。切换日按错顺序 = 少导一段数据,
// 而且事后无从发现(各脚本只打印自己的报告,没人比对)。
//
// 本文件把链收成一处:
//   * **权威顺序**写在 STEPS 里(每步注明它依赖谁);
//   * **逐步执行、失败即停**,不给人"跳着跑"的机会;
//   * **末尾统一对账**(reconcile.mjs),有不可解释差额即以退出码 1 拦停;
//   * **目标库必须显式确认**(--yes),且 --fresh 拒绝无保护地 DROP 正式 schema。
//
// 用法:
//   node scripts/migrate/rehearse.mjs --list
//   node scripts/migrate/rehearse.mjs --target acore_portal_rehearsal --fresh --yes
//   MIGRATE_DATABASE_URL=… node scripts/migrate/rehearse.mjs --yes
import { spawnSync } from "node:child_process";
import { readFileSync, stat } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import {
  loadEnv,
  resolveDbUrl,
  targetSchema,
  createPool,
  runSqlFile,
} from "./lib/db.mjs";
import { reconcileAll, printReport } from "./reconcile.mjs";
import { ensureAdmin } from "./lib/admin.mjs";

const MIGRATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MIGRATE_DIR, "..", "..");

/**
 * 权威迁移顺序。每步的 `after` 注明它依赖的前序步骤(写在这里=顺序本身就是文档)。
 * optional 的步骤属媒体组:需 COS 凭据与 uploads 目录,默认不跑(--with-media 才跑)。
 */
export const STEPS = [
  {
    id: "media-cos",
    title: "媒体上传 COS + 建 image_asset_map",
    kind: "node",
    file: "cos-upload.mjs",
    after: [],
    media: true,
    note: "全链媒体组第一步:内容/论坛/商品图的 URL 重写都以 image_asset_map 为准,map 空则旧 URL 永久落库",
  },
  {
    id: "users",
    title: "M1 存量用户",
    kind: "sql",
    file: "wp-users-import.sql",
    after: [],
    note: "所有域的用户映射锚点",
  },
  {
    id: "shop",
    title: "US6 商城存量(分类/商品/订单/行/复核)",
    kind: "sql",
    file: "shop-import.sql",
    after: ["users"],
    note: "订单按 post_author 映射用户",
  },
  {
    id: "slug",
    title: "商城 slug 归一",
    kind: "node",
    file: "slug-normalize.mjs",
    after: ["shop"],
    note: "必须紧跟商城导入(解 WP 百分号编码 slug)",
  },
  {
    id: "points",
    title: "US6 积分流水 + D7 对账 + 建户",
    kind: "node",
    file: "import-points.mjs",
    after: ["users"],
    note: "流水按 user_id 归属;与商城导入互不依赖",
  },
  {
    id: "content",
    title: "M3 内容存量(分类/文章/静态页/渐进/开发日志)",
    kind: "node",
    file: "content-import.mjs",
    after: ["media-cos"],
    note: "读 wp_legacy,写内容域五表;图片 URL 依 image_asset_map 重写",
  },
  {
    id: "forum",
    title: "M4 论坛存量(版块/主题/回复)",
    kind: "node",
    file: "forum-import.mjs",
    after: ["users", "media-cos"],
    note: "作者按 wp_user_id 映射用户;楼层正文同样按 image_asset_map 重写",
  },
  {
    id: "route-map-m3",
    title: "旧链映射 M3(p/page_id/cat/topic/forum)",
    kind: "sql",
    file: "route-map-m3.sql",
    after: ["content", "forum"],
    note: "⑤⑥ 两键读 forum_thread/forum_board → 必须在论坛导入之后",
  },
  {
    id: "route-map-m4",
    title: "旧链映射 M4(六工具页)",
    kind: "sql",
    file: "route-map-m4.sql",
    after: ["route-map-m3"],
    note: "续填 M3 的 page_id 键空间",
  },
  {
    id: "board-descriptions",
    title: "论坛版块说明回填",
    kind: "sql",
    file: "forum-board-descriptions.sql",
    after: ["forum"],
    note: "人工文案,按 slug 覆盖版块说明",
  },
  {
    id: "guide-pages",
    title: "教程升格静态页",
    kind: "node",
    file: "promote-guide-pages.mjs",
    after: ["content"],
    note: "article → content_page;正文缺失时回源 wp_legacy",
  },
  {
    id: "product-images",
    title: "商品图回填",
    kind: "node",
    file: "product-images.mjs",
    after: ["media-cos"],
    media: true,
    note: "存量商品主图+正文图",
  },
  {
    id: "media-library",
    title: "媒体库回填",
    kind: "node",
    file: "media-library-backfill.mjs",
    after: ["media-cos"],
    media: true,
    note: "image_asset_map → media_asset",
  },
  {
    id: "media-verify",
    title: "媒体三方对账",
    kind: "node",
    file: "verify.mjs",
    after: ["media-library"],
    media: true,
    note: "台账↔媒体库↔商品图",
  },
];

function parseArgs(argv) {
  const opts = {
    only: [],
    skip: [],
    withMedia: false,
    fresh: false,
    yes: false,
    list: false,
    uploadsDir: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target") opts.target = argv[++i];
    else if (a === "--only") opts.only.push(argv[++i]);
    else if (a === "--skip") opts.skip.push(argv[++i]);
    else if (a === "--with-media") opts.withMedia = true;
    else if (a === "--scan-only") opts.scanOnly = true;
    else if (a === "--cdn-base") opts.cdnBase = argv[++i];
    else if (a === "--uploads-dir") opts.uploadsDir = argv[++i];
    else if (a === "--fresh") opts.fresh = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--allow-drop") opts.allowDrop = true;
    else if (a === "--list") opts.list = true;
    else throw new Error(`未知参数:${a}`);
  }
  return opts;
}

/** 用目标 schema 替换连接串里的库名,其余(host/port/账号)保持不变 */
function urlWithSchema(url, schema) {
  const u = new URL(url);
  u.pathname = `/${schema}`;
  return u.toString();
}

/** 重建目标 schema(--fresh):DROP + CREATE(连 mysql 系统库,避免 DROP 掉当前默认库) */
async function recreateSchema(targetUrl, schema, allowDrop) {
  if (schema === "acore_portal" && !allowDrop) {
    throw new Error(
      `拒绝 DROP 正式 schema「${schema}」。这是开发/生产的业务库,` +
        "演练请用独立 schema(如 acore_portal_rehearsal);确需重建加 --allow-drop。",
    );
  }
  const u = new URL(targetUrl);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: "mysql",
    charset: "utf8mb4",
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
    await conn.query(
      `CREATE DATABASE \`${schema}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`[rehearse] 已重建 schema:${u.hostname}:${u.port}/${schema}`);
  } finally {
    await conn.end();
  }
}

function runNodeStep(step, targetUrl, extraArgs = []) {
  const res = spawnSync(process.execPath, [path.join(MIGRATE_DIR, step.file), ...extraArgs], {
    stdio: "inherit",
    env: { ...process.env, MIGRATE_DATABASE_URL: targetUrl },
  });
  return res.status ?? 1;
}

async function runSqlStep(step) {
  const sql = readFileSync(path.join(MIGRATE_DIR, step.file), "utf8");
  await runSqlFile(sql);
  return 0;
}

function runPrismaDeploy(targetUrl) {
  const res = spawnSync("pnpm", ["db:deploy"], {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: targetUrl },
  });
  return res.status ?? 1;
}

/**
 * 媒体组预检:①media_asset.uploaded_by 是必填外键,回填需要一个真实管理员账号;
 * ②cos.cdnBase 缺失时映射会把正文图片 URL 改写成无效值(失败关闭)。
 * 迁移链只导 role=user 的存量用户(WP 用户一律 role=user),**不会**创建管理员——
 * 切换前必须先在新站建管理员,否则媒体组无法回填。此处提前拦停,免得链跑一半才炸。
 */
async function preflightMedia(pool, selected) {
  const ids = new Set(selected.map((s) => s.id));
  if (ids.has("media-library")) {
    const [[admin]] = await pool.query(`SELECT COUNT(*) n FROM user WHERE role = 'admin'`);
    if (Number(admin?.n ?? 0) === 0) {
      console.error(
        "[rehearse] 目标库无管理员账号:媒体库回填(media_asset.uploaded_by 外键)需要管理员。\n" +
          "  迁移链只导 role=user 的存量用户,不会创建管理员——请先在目标库建管理员" +
          "(注册后提升 role=admin),或用 MIGRATE_ADMIN_USERNAME/MIGRATE_ADMIN_PASSWORD 让编排器代建。",
      );
      return false;
    }
  }
  if (ids.has("media-cos")) {
    const [[cdn]] = await pool.query(
      `SELECT value FROM system_config WHERE \`key\` = 'cos.cdnBase'`,
    );
    if (!cdn?.value) {
      console.error(
        "[rehearse] 目标库缺 system_config.cos.cdnBase:媒体映射无法生成有效图片 URL。\n" +
          "  正式切换:在后台「设置」配好 COS;纯演练:加 --cdn-base https://cdn.example.invalid 占位。",
      );
      return false;
    }
  }
  return true;
}

/** 演练占位:目标库无 cos.cdnBase 时写入 --cdn-base 给的地址(已有真配置则不覆盖) */
async function seedCdnBase(pool, cdnBase) {
  await pool.query(
    `INSERT INTO system_config (\`key\`, value, updated_at) VALUES ('cos.cdnBase', ?, NOW(3))
     ON DUPLICATE KEY UPDATE value = IF(system_config.value = '', VALUES(value), system_config.value)`,
    [cdnBase],
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  loadEnv();

  if (opts.list) {
    for (const s of STEPS) {
      console.log(`${s.id.padEnd(20)} ${s.title}${s.media ? "  [媒体组]" : ""}`);
    }
    return 0;
  }

  const baseUrl = resolveDbUrl();
  const schema = opts.target ?? targetSchema(baseUrl);
  const targetUrl = urlWithSchema(baseUrl, schema);

  console.log(`[rehearse] 源库 schema:wp_legacy   目标 schema:${schema}`);
  console.log(`[rehearse] 目标连接:${new URL(targetUrl).host}/${schema}`);

  if (!opts.yes) {
    console.error(
      "\n迁移是写操作且部分步骤不可逆(用户导入会先 DELETE 已迁行)。" +
        "\n确认目标库无误后重跑并加 --yes。",
    );
    return 2;
  }

  if (opts.fresh) {
    await recreateSchema(targetUrl, schema, opts.allowDrop);
  }

  const steps = STEPS.filter((s) => {
    if (s.media && !opts.withMedia) return false;
    if (opts.only.length > 0) return opts.only.includes(s.id);
    return !opts.skip.includes(s.id);
  });
  const skippedMedia = STEPS.filter((s) => s.media && !opts.withMedia).map((s) => s.id);
  // 媒体映射未跑 → 正文里的旧图 URL 无处可重写:此时「内容域死链」是预期态而非事故,
  // 交由对账器降级为 WARN 并在报告里点名,避免链在中途被误判失败。
  const mediaMapped = steps.some((s) => s.id === "media-cos");

  process.env.MIGRATE_DATABASE_URL = targetUrl;
  process.env.DATABASE_URL = targetUrl;
  if (!mediaMapped) process.env.MIGRATE_MEDIA_PENDING = "1";

  // schema 先到位(目标库须已 Prisma migrate)
  const prismaStatus = runPrismaDeploy(targetUrl);
  if (prismaStatus !== 0) {
    console.error("[rehearse] prisma migrate deploy 失败,迁移中止");
    return prismaStatus;
  }

  const done = [];
  const pool = createPool();
  try {
    const mediaSelected = steps.some((s) => s.media);
    if (mediaSelected) {
      // uploads 目录前置:不显式给就用 cos-upload.mjs 的开发机默认值,生产必然不存在
      // → 步骤直接退出、链断在第一步。故在开跑前拦停并说清怎么给。
      if (!opts.uploadsDir) {
        console.error(
          "[rehearse] ✗ 媒体组需要 uploads 目录:用 --uploads-dir <dir> 显式指定" +
            "(cos-upload.mjs 的默认值是开发机路径 ~/Code/lokta/files/wordpress/wp-content/uploads,生产不存在)",
        );
        return 2;
      }
      const dirStat = await stat(opts.uploadsDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        console.error(`[rehearse] ✗ uploads 目录不存在: ${opts.uploadsDir}`);
        return 2;
      }
      // 演练占位 CDN(已有真配置不覆盖)
      if (opts.cdnBase) await seedCdnBase(pool, opts.cdnBase);
      // 管理员:目标库没有就按 env 给的口令代建(媒体库回填的 uploaded_by 外键)
      const adminUsername = process.env.MIGRATE_ADMIN_USERNAME ?? "cutover-admin";
      const adminPassword = process.env.MIGRATE_ADMIN_PASSWORD;
      try {
        const { created } = await ensureAdmin(pool, {
          username: adminUsername,
          password: adminPassword,
        });
        if (created) {
          console.log(
            `[rehearse] 已建管理员账号:${adminUsername}(口令来自 MIGRATE_ADMIN_PASSWORD,上线前请在后台改密)`,
          );
        }
      } catch (err) {
        console.error(`[rehearse] ✗ 管理员引导失败:`, err instanceof Error ? err.message : err);
        return 1;
      }
      if (!(await preflightMedia(pool, steps))) return 1;
    }

    for (const step of steps) {
      const started = Date.now();
      console.log(`\n[rehearse] ▶ ${step.id} — ${step.title}`);
      let status = 0;
      try {
        const extraArgs = [];
        if (step.id === "media-cos") {
          if (opts.scanOnly) extraArgs.push("--scan-only");
          // uploads 目录必须显式给:cos-upload.mjs 的默认值是开发机路径
          // (~/Code/lokta/files/wordpress/wp-content/uploads),生产环境不存在 →
          // 步骤直接退出,链断在这里(2026-11-14 切换前发现)。
          if (opts.uploadsDir) extraArgs.push("--uploads-dir", opts.uploadsDir);
        }
        status =
          step.kind === "sql" ? await runSqlStep(step) : runNodeStep(step, targetUrl, extraArgs);
      } catch (err) {
        console.error(`[rehearse] ✗ ${step.id} 异常:`, err instanceof Error ? err.message : err);
        return 1;
      }
      if (status !== 0) {
        console.error(`[rehearse] ✗ ${step.id} 退出码 ${status},后续步骤不再执行`);
        return status;
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`[rehearse] ✓ ${step.id}（${secs}s）`);
      done.push(step.id);
    }

    console.log(
      `\n[rehearse] 已完成 ${done.length} 步${skippedMedia.length ? `,跳过媒体组:${skippedMedia.join(", ")}` : ""}`,
    );
    if (!mediaMapped) {
      console.warn(
        "[rehearse] ⚠ 本次未跑 media-cos:正文图片仍指向旧站 /wp-content/uploads/," +
          "切换前必须补跑媒体组并复跑对账。",
      );
    }

    const result = await reconcileAll(pool, { mediaPending: !mediaMapped });
    printReport(result);
    return result.fail > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}

// 直接执行才跑链(被 import 时只导出 STEPS,供守卫测试读取)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await main();
  process.exitCode = status;
}
