"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api-client";
import { changedSorts, moveByIndex, moveToIndex, reconcileOrder } from "@/components/admin/sortable-order";

/**
 * 管理台通用「可排序列表」(#79:轮播/版块两处同构排序状态机抽取):
 * 本地顺序 + props 对齐 + 拖拽/↑↓ 移动 + 按新序持久化 sort;
 * 防重入(保存中忽略新的排序请求)、失败回滚(顺序仅在保存成功后落地)。
 * 领域差异(请求体形状)由调用方经 save(item, index) 注入,本 Hook 只管顺序与流程。
 */

export type SortableItem = { id: string; sort: number };

export type SortableListApi<T extends SortableItem> = {
  /** 按当前本地顺序排列的条目 */
  ordered: readonly T[];
  /** 正在拖拽的条目 id */
  dragId: string | null;
  setDragId: (id: string | null) => void;
  /** 持久化进行中(按钮禁用/提示用) */
  reordering: boolean;
  /** 上移/下移一位 */
  moveBy: (id: string, delta: number) => void;
  /** 拖拽落到目标位置 */
  moveTo: (dragId: string, targetId: string) => void;
};

export function useSortableList<T extends SortableItem>({
  items,
  enabled = true,
  save,
  onError,
  onPersisted,
}: {
  items: readonly T[];
  /** 外部忙碌/未 hydration 时禁用排序交互 */
  enabled?: boolean;
  /** 持久化单条:调用方决定请求体(须带上新 sort) */
  save: (item: T, index: number) => Promise<void>;
  onError?: (message: string) => void;
  onPersisted?: () => void;
}): SortableListApi<T> {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // 回调以 ref 读取:persistOrder 保持稳定身份,避免父级重渲染导致回调抖动
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const saveRef = useRef(save);
  saveRef.current = save;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onPersistedRef = useRef(onPersisted);
  onPersistedRef.current = onPersisted;
  const orderRef = useRef(order);
  orderRef.current = order;
  const reorderingRef = useRef(false);

  // props(refresh 后)与本地顺序对齐:消失的移除、新出现的追加
  const idsKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    const ids = itemsRef.current.map((i) => i.id);
    setOrder((prev) => reconcileOrder(prev, ids));
  }, [idsKey]);

  const persistOrder = useCallback(async (next: string[]) => {
    if (!enabledRef.current || reorderingRef.current) return;
    reorderingRef.current = true;
    setReordering(true);
    try {
      const byId = new Map(itemsRef.current.map((i) => [i.id, i]));
      const changed = changedSorts(next, (id) => byId.get(id)?.sort);
      await Promise.all(
        changed.map(({ id, index }) => {
          const item = byId.get(id);
          return item ? saveRef.current(item, index) : Promise.resolve();
        }),
      );
      setOrder(next);
      onPersistedRef.current?.();
    } catch (err) {
      onErrorRef.current?.(errorMessage(err));
    } finally {
      reorderingRef.current = false;
      setReordering(false);
    }
  }, []);

  const moveBy = useCallback(
    (id: string, delta: number) => {
      const next = moveByIndex(orderRef.current, id, delta);
      if (!next) return;
      void persistOrder(next);
    },
    [persistOrder],
  );

  const moveTo = useCallback(
    (fromId: string, targetId: string) => {
      const next = moveToIndex(orderRef.current, fromId, targetId);
      setDragId(null);
      if (!next) return;
      void persistOrder(next);
    },
    [persistOrder],
  );

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i): i is T => Boolean(i));

  return { ordered, dragId, setDragId, reordering, moveBy, moveTo };
}
