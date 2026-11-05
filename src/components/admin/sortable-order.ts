/**
 * 可排序列表的纯排序原语(#79):与视图/IO 无关,便于单测覆盖。
 * 语义:顺序以 id 数组表达,sort 由下标派生(与持久化口径一致)。
 */

/** props 刷新后与本地顺序对齐:消失的移除、新出现的追加 */
export function reconcileOrder(prev: readonly string[], ids: readonly string[]): string[] {
  const kept = prev.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

/** 上移/下移一位;越界返回 null */
export function moveByIndex(ids: readonly string[], id: string, delta: number): string[] | null {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}

/** 拖拽落到目标位置(插入到目标原下标处);同一项或目标缺失返回 null */
export function moveToIndex(
  ids: readonly string[],
  fromId: string,
  targetId: string,
): string[] | null {
  if (!fromId || fromId === targetId) return null;
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0) return null;
  const next = ids.filter((id) => id !== fromId);
  next.splice(targetIndex, 0, fromId);
  return next;
}

/** 需要持久化 sort 的条目:sort 与新下标不一致者 */
export function changedSorts(
  order: readonly string[],
  sortOf: (id: string) => number | undefined,
): { id: string; index: number }[] {
  const changed: { id: string; index: number }[] = [];
  order.forEach((id, index) => {
    const sort = sortOf(id);
    if (sort !== undefined && sort !== index) changed.push({ id, index });
  });
  return changed;
}
