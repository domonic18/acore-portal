import {
  EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE,
  EMBED_AVAILABLE_HEIGHT_TYPE,
  EMBED_CHILD_SOURCE,
  EMBED_HEIGHT_MAX_PX,
  EMBED_HEIGHT_MIN_PX,
  EMBED_HEIGHT_TYPE,
  EMBED_PARENT_SOURCE,
} from "@/constants/embed";

/**
 * iframe 嵌入高度协议(纯函数,零 IO):
 * 被嵌入的 rank 子站(acore-ranking)把内容高度 postMessage 给门户,
 * 门户据此把 iframe 撑到内容高度,消掉 iframe 内层滚动。
 * 反向:门户把 iframe 的可用高度下发给子站,子页据此裁剪内容(首页「最近成就」)。
 * 协议对端:acore-ranking frontend/src/shared/constants/embed.ts
 */

/** 解析高度上报消息;非本协议或非法高度返回 null */
export function parseIframeHeightMessage(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const { source, type, height } = data as {
    source?: unknown;
    type?: unknown;
    height?: unknown;
  };
  if (source !== EMBED_CHILD_SOURCE) return null;
  if (type !== EMBED_HEIGHT_TYPE) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return height;
}

/** 高度收敛到可用区间(下限防首帧塌陷,上限防超长页把外层页面拉爆) */
export function clampIframeHeight(height: number): number {
  return Math.min(
    EMBED_HEIGHT_MAX_PX,
    Math.max(EMBED_HEIGHT_MIN_PX, Math.round(height)),
  );
}

/** 构造「下发可用高度」消息;非法高度返回 null(不发无意义消息) */
export function buildHeightAvailableMessage(
  height: number,
): {
  source: typeof EMBED_PARENT_SOURCE;
  type: typeof EMBED_AVAILABLE_HEIGHT_TYPE;
  height: number;
} | null {
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return {
    source: EMBED_PARENT_SOURCE,
    type: EMBED_AVAILABLE_HEIGHT_TYPE,
    height: Math.round(height),
  };
}

/** 是否为子页的「索要可用高度」消息 */
export function parseAvailableHeightRequest(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const { source, type } = data as { source?: unknown; type?: unknown };
  if (source !== EMBED_CHILD_SOURCE) return false;
  return type === EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE;
}

/** 取 iframe src 的源站(src 非法时返回 null,表示无法校验) */
export function resolveIframeOrigin(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

/**
 * iframe 是否已导航到目标页(而非初始的 about:blank)。
 * 未导航时 contentWindow 还是 about:blank,其 origin 继承父页 → 按子站 origin 投递
 * 必然对不上(浏览器报 "target origin ... does not match the recipient window's origin")。
 * 探测:跨源访问 contentWindow.location 会抛错 → 已到跨源目标页;
 * 同源可读 → 比对 href 是否仍为 about:blank。
 * 不依赖 load 事件:iframe 可能在 React 挂载前就加载完毕,load 事件会被漏接。
 */
export function isIframeNavigated(iframe: {
  contentWindow: { location: { href: string } } | null;
}): boolean {
  const win = iframe.contentWindow;
  if (!win) return false;
  try {
    return win.location.href !== "about:blank";
  } catch {
    return true;
  }
}

/**
 * 消息是否来自目标 iframe 自身:双重校验(源窗口 + 源站)。
 * 源窗口对不上直接拒——别的页面伪造不出 iframe.contentWindow。
 */
export function isMessageFromIframe(
  event: { source: unknown; origin: string },
  iframe: { contentWindow: unknown; src: string },
): boolean {
  if (!iframe.contentWindow) return false;
  if (event.source !== iframe.contentWindow) return false;
  const origin = resolveIframeOrigin(iframe.src);
  return origin === null ? true : event.origin === origin;
}
