// 论坛转换器(US5 T035;research R4/R5):wp 帖子 → forum_thread/post 字段
// 仅迁移期使用(mjs,被 forum-import 与单测共用);类型声明见同目录 forum-convert.d.mts

/** Q3 契约:仅三种已知状态前缀剥离,其余(【已处理】【测试结果】…存量高频)保留原文 */
const STATUS_PREFIXES = [
  ["规范", "standard"],
  ["已解决", "resolved"],
  ["已关闭", "closed"],
];

/** 标题状态前缀剥离:【规范】xxx → standard+净标题;未知前缀/净标题为空 → 保留原文+none */
export function stripStatusPrefix(title) {
  const raw = title ?? "";
  for (const [name, label] of STATUS_PREFIXES) {
    const m = new RegExp(`^【${name}】\\s*(.*)$`).exec(raw);
    if (m && m[1].trim()) {
      return { label, title: m[1].trim() };
    }
  }
  return { label: "none", title: raw };
}

/** wp 早序:post_date 升序,同秒按 ID 升序(楼层分配唯一化) */
export function byEarlyOrder(a, b) {
  const da = a.created_at instanceof Date ? a.created_at.getTime() : 0;
  const db = b.created_at instanceof Date ? b.created_at.getTime() : 0;
  if (da !== db) return da - db;
  return Number(a.id) - Number(b.id);
}

/** 楼层分配:主贴固定 1,回复按早序从 2 连续编号 */
export const MAIN_POST_FLOOR = 1;

export function floorOfReply(index) {
  return index + 2;
}

/** 存量 post_status → 可见性(只读归档:publish/closed 可见,其余软隐藏数据保留) */
export function visibleFromStatus(status) {
  return status === "publish" || status === "closed";
}

/** 版块固定 slug 映射(存量 5 版块;301 依赖稳定 slug,route-m3 SQL 同源) */
export const BOARD_SLUGS = {
  588: "feedback",
  637: "share",
  1136: "appeal",
  1264: "report",
  2968: "strategy",
};
