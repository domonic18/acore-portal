// 切换期管理员引导(2026-11-07 迁移就绪度收口):
//
// 迁移链只导 role=user 的存量用户(WP 用户一律 role=user),**不会**创建管理员——
// 而 media_asset.uploaded_by 是必填外键(非空),媒体库回填必须挂在一个管理员账号上。
// 于是切换日出现一个死结:全新目标库里没有管理员 → 媒体组跑不完 → 图片 URL 永不重写。
//
// 本模块给编排器一条显式出路:目标库无管理员时,用运维 env 里给的口令建一个。
// 口令只从 env 读(不进命令行历史/不入日志/不入库明文),建完即由运维在后台改密。
//
// 口令哈希必须与登录校验路径逐字节同构(src/lib/auth/wp-bcrypt.ts):
//   stored = "$wp$" + bcrypt(base64(HMAC-SHA384('wp-sha384', password.trim())))
// 本文件复刻该算法,漂移由 tests/unit/migrate-admin.test.ts 对齐断言兜住。
import crypto from "node:crypto";
import bcrypt from "bcrypt";

const WP_PREHASH_SECRET = "wp-sha384";
const BCRYPT_COST = 12;

/** 与 src/lib/auth/wp-bcrypt.ts 的 wpPreHash 同构(签发侧 trim) */
export function wpPreHash(password, trim = false) {
  const input = trim ? password.trim() : password;
  return crypto
    .createHmac("sha384", WP_PREHASH_SECRET)
    .update(input, "utf8")
    .digest("base64");
}

/** 与 app 的 hashWpBcrypt 同构:"$wp" + bcrypt 体,minor 归一为 $2y$ */
export async function hashWpPassword(password, cost = BCRYPT_COST) {
  const body = await bcrypt.hash(wpPreHash(password, true), cost);
  const normalized = /^\$2[ab]\$/.test(body) ? `$2y$${body.slice(4)}` : body;
  return `$wp${normalized}`;
}

/**
 * 目标库已有管理员 → 不动(幂等);没有 → 建一个。
 * 返回 { created: boolean, username }。
 */
export async function ensureAdmin(pool, { username, password, email }) {
  const [[existing]] = await pool.query(`SELECT id FROM user WHERE role = 'admin' LIMIT 1`);
  if (existing) return { created: false, username: null };

  if (!username || !password) {
    throw new Error(
      "目标库无管理员账号,且未提供 MIGRATE_ADMIN_USERNAME / MIGRATE_ADMIN_PASSWORD。" +
        "媒体库回填需要管理员(uploaded_by 外键)——请先在目标库建管理员再补跑媒体组。",
    );
  }
  const mail = email ?? `${username}@migration.invalid`;
  const passwordHash = await hashWpPassword(password);
  await pool.query(
    `INSERT INTO user (username, email, password_hash, password_algo, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'bcrypt_wp', 'admin', 'active', NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE role = 'admin'`,
    [username, mail, passwordHash],
  );
  return { created: true, username };
}
