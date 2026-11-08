/**
 * 后台「独立控制台」标记(2026-11-08 性能):
 * 后台不需要门户页头页脚与装饰性大图(实测每页白下载 244KB background.jpg),
 * 但根布局拿不到路由路径,故由 middleware 对 /admin* 请求打这个头告知。
 */
export const ADMIN_SURFACE_HEADER = "x-portal-surface";

/** ADMIN_SURFACE_HEADER 的取值:命中即表示当前是后台表面 */
export const ADMIN_SURFACE_VALUE = "admin";
