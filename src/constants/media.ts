/**
 * 媒体分类(对齐旧站 FileBird 一级文件夹,迁移回填口径见
 * scripts/migrate/media-library-backfill.mjs);新增分类需在此登记。
 * 分类名是写路径契约:上传与编辑组件一律引常量,禁止局部复写(issue #88)。
 */
export const MEDIA_CATEGORY_SHOP = "商店配图";
export const MEDIA_CATEGORY_FORUM = "论坛图片";
/** 视频分类(2026-11-06 轮播视频):服务端按 mime 强制落此分类,不靠前端传分类名 */
export const MEDIA_CATEGORY_VIDEO = "视频";

export const MEDIA_CATEGORIES = [
  MEDIA_CATEGORY_SHOP,
  "网站公告",
  MEDIA_CATEGORY_FORUM,
  "网站素材",
  "游戏资讯",
  MEDIA_CATEGORY_VIDEO,
  "其他",
] as const;

export const MEDIA_DEFAULT_CATEGORY = "其他";
