/**
 * 媒体分类(对齐旧站 FileBird 一级文件夹,迁移回填口径见
 * scripts/migrate/media-library-backfill.mjs);新增分类需在此登记。
 */
export const MEDIA_CATEGORIES = [
  "商店配图",
  "网站公告",
  "论坛配文",
  "网站素材",
  "游戏资讯",
  "其他",
] as const;

export const MEDIA_DEFAULT_CATEGORY = "其他";
