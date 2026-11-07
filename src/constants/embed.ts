/**
 * 跨仓 iframe 嵌入协议(常量唯一来源)。
 *
 * 对端实现:acore-ranking frontend/src/shared/constants/embed.ts
 *
 * 协议有两个方向、互不干扰:
 * ① 子页上报内容高度 → 父页把 iframe 撑高(工具页:英雄榜/在线玩家等,消掉内层滚动);
 * ② 父页下发可用高度 → 子页把内容裁剪到框高(首页「最近成就」:该区块要求与右栏等高,
 *    父页不会撑高 iframe,只能由子页裁剪 + 渐隐;新窗口出口由本页页头承担)。
 *
 * 消息:
 *   子 → 父  { source: 'acore-ranking', type: 'height', height }              内容高度上报
 *   父 → 子  { source: 'acore-portal',  type: 'height-request' }              索要内容高度(握手)
 *   子 → 父  { source: 'acore-ranking', type: 'available-height-request' }    索要可用高度(握手)
 *   父 → 子  { source: 'acore-portal',  type: 'height-available', height }    下发可用高度
 */

/** 子页 → 父页 的消息来源标识 */
export const EMBED_CHILD_SOURCE = "acore-ranking";

/** 父页 → 子页 的消息来源标识 */
export const EMBED_PARENT_SOURCE = "acore-portal";

/** 子 → 父:上报内容高度 */
export const EMBED_HEIGHT_TYPE = "height";

/** 父 → 子:索要内容高度(握手:父页监听器就绪后补要一次) */
export const EMBED_HEIGHT_REQUEST_TYPE = "height-request";

/** 子 → 父:索要可用高度(握手:父页监听器就绪后补要一次) */
export const EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE = "available-height-request";

/** 父 → 子:下发可用高度 */
export const EMBED_AVAILABLE_HEIGHT_TYPE = "height-available";

/** 自动撑高下限/上限(px):下限防首帧塌陷,上限防超长页把外层页面拉爆 */
export const EMBED_HEIGHT_MIN_PX = 320;
export const EMBED_HEIGHT_MAX_PX = 3000;
