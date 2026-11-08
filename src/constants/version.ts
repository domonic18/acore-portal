/**
 * 构建信息常量(构建期内联,非运行期 env)。
 *
 * NEXT_PUBLIC_* 由 next build 固化进产物:值与镜像绑定,不会出现
 * 「容器 env 与镜像产物说法不一致」。必须写字面量形式——Next 只内联
 * `process.env.XXX` 的字面量,动态拼键不会被替换。
 *
 * 取值来源:
 *   BUILD_TIME —— docker/web/Dockerfile 的 ARG BUILD_TIME,自动部署时
 *                 由 deploy-staging.sh 以 --build-arg 传入(上海时区,精确到分)
 *   APP_SHA    —— 同上,提交短号,与镜像 tag / current-sha 同源
 *
 * 本地手工构建不传 --build-arg 时为 "unknown",页面据此不渲染构建信息行。
 */
const RAW_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const RAW_APP_SHA = process.env.NEXT_PUBLIC_APP_SHA ?? "";

/** 构建时间(形如 "2026-11-08 10:52");未知时为空串 */
export const BUILD_TIME = RAW_BUILD_TIME === "unknown" ? "" : RAW_BUILD_TIME;

/** 提交短号(形如 "e04370b");未知时为空串 */
export const APP_SHA = RAW_APP_SHA === "unknown" ? "" : RAW_APP_SHA;

/**
 * 页脚构建信息文案:「构建于 2026-11-08 10:52 · e04370b」。
 * 缺项不拼空段;两值皆空时返回空串(页面据此整行不渲染)。
 */
export function formatBuildInfo(buildTime: string, sha: string): string {
  return [buildTime ? `构建于 ${buildTime}` : "", sha].filter(Boolean).join(" · ");
}
