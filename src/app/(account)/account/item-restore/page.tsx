"use client";

import { useCallback, useEffect, useState } from "react";
import { className, raceName } from "@/constants/characters";
import { errorMessage, requestJson } from "@/lib/api-client";

type Character = {
  guid: number;
  name: string;
  race: number;
  class: number;
  level: number;
};

type RestorableItem = {
  entry: number;
  name: string | null;
  quality: number | null;
  count: number;
};

/** M1 只读:选本人角色→恢复列表(归属 403 由服务端强制+审计);执行入口 M2 开放 */
export default function ItemRestorePage() {
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guid, setGuid] = useState<number | null>(null);
  const [items, setItems] = useState<RestorableItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadItems = useCallback(async (target: number) => {
    setLoading(true);
    setItemsError(null);
    setItems(null);
    try {
      const body = await requestJson<{ items?: RestorableItem[] }>(
        `/api/account/restore-items?guid=${target}`,
      );
      setItems(body.items ?? []);
    } catch (err) {
      setItemsError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const body = await requestJson<{ characters: Character[] }>("/api/account/characters");
        setCharacters(body.characters);
        const first = body.characters[0];
        if (first) {
          setGuid(first.guid);
          void loadItems(first.guid);
        }
      } catch {
        setLoadError("角色列表加载失败,请稍后重试。");
      }
    })();
  }, [loadItems]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">物品恢复</h1>
      <p className="text-sm text-[#93b2ce]">
        查看角色名下可恢复的物品。M1 仅提供查询,恢复执行将在后续版本开放。
      </p>

      {loadError && (
        <p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          {loadError}
        </p>
      )}

      {characters !== null && characters.length === 0 && (
        <p className="text-sm text-[#93b2ce]">名下暂无游戏角色,无法查询恢复物品。</p>
      )}

      {characters !== null && characters.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-sm md:max-w-xs">
            选择角色
            <select
              value={guid ?? ""}
              onChange={(e) => {
                const next = Number(e.target.value);
                setGuid(next);
                void loadItems(next);
              }}
              className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
            >
              {characters.map((c) => (
                <option key={c.guid} value={c.guid} className="bg-[#0d1828]">
                  {c.name}({raceName(c.race)}/{className(c.class)},Lv{c.level})
                </option>
              ))}
            </select>
          </label>

          {loading && <p role="status" className="text-sm text-[#93b2ce]">加载中…</p>}
          {itemsError && (
            <p role="alert" className="text-sm text-red-400">
              {itemsError}
            </p>
          )}
          {items !== null && !loading && (
            <ul className="flex flex-col gap-1 text-sm">
              {items.length === 0 ? (
                <li className="rounded border border-dashed border-[#22385a] px-4 py-8 text-center text-[#93b2ce]">
                  该角色暂无可恢复物品。
                </li>
              ) : (
                items.map((item) => (
                  <li
                    key={item.entry}
                    className="flex items-center gap-3 rounded-md border border-[#22385a] px-4 py-2"
                  >
                    <span className="font-medium">{item.name ?? `物品 #${item.entry}`}</span>
                    <span className="text-[#6482a3]">×{item.count}</span>
                    <button
                      type="button"
                      disabled
                      className="ml-auto rounded-md border border-[#22385a] px-3 py-1 text-xs text-[#6482a3]"
                      title="恢复执行将在后续版本开放"
                    >
                      恢复(即将开放)
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
