/** 登录后的默认落点 */
export const DEFAULT_LOGIN_NEXT = "/account/overview";

const BASE = "http://internal.invalid";

/**
 * 登录回跳只接受站内相对路径:挡 `//evil.com`、`/\evil.com`、制表符变体外链。
 * 用 URL 解析而非手动前缀判断,让浏览器自己的规范化规则(去空白、反斜杠转斜杠)参与判据。
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return DEFAULT_LOGIN_NEXT;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return DEFAULT_LOGIN_NEXT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_LOGIN_NEXT;
  }
}
