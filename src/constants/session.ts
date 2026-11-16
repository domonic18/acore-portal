/** 会话域常量(research R4) */
export const SESSION = {
  ACCESS_COOKIE: "ap_access",
  REFRESH_COOKIE: "ap_refresh",
  ACCESS_TTL_SECONDS: 2 * 60 * 60, // 2h
  REFRESH_TTL_SECONDS: 30 * 24 * 60 * 60, // remember 30d
  REDIS_PREFIX: "session", // session:{userId}:{jti}
  REFRESH_REDIS_PREFIX: "refresh", // refresh:{userId}:{tokenId}
  REFRESH_ROTATION_PREFIX: "refreshrot", // refreshrot:{userId}:{tokenId} 轮换宽限标记
  REFRESH_ROTATION_GRACE_SECONDS: 60, // 并发续期幂等窗
} as const;

/**
 * 受保护路径前缀:无有效会话时需引导登录。
 * middleware 路由守卫与续期失败落点共用同一判据,避免两处漂移。
 */
export const SESSION_PROTECTED_PREFIXES = ["/account", "/admin"] as const;

export function isProtectedPath(pathname: string): boolean {
  return SESSION_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 后台路径(角色校验用) */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** 用户名规则 FR-003:2-32 位,禁 @ */
export const USERNAME_REGEX = /^[A-Za-z0-9_一-龥]{2,32}$/;
