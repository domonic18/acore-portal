/**
 * 站点角色取值域(user/moderator/admin):与业务库枚举 user_role 对齐。
 * 客户端组件不能用生成的 Prisma client(打包体积 + node 依赖),故在常量层显式落一份,
 * 后台角色分配的下拉与 API 校验共用它,避免各处各写字面量后漂移。
 * 提权到 admin 是不可逆的高权限操作(可管理全站数据),其二次确认判定见 lib/role-elevation.ts。
 */
export const USER_ROLES = ["user", "moderator", "admin"] as const;

/** 可管理全站数据的角色(提权到此角色需二次确认) */
export const ADMIN_ROLE = "admin";
