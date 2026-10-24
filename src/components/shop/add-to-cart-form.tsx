"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CharacterSelect, type CharacterOption } from "./character-select";

/**
 * 加购表单(客户端交互面):POST /api/cart 契约映射——
 * 401 跳登录引导(FR-111/112);403 越权提示;409 售罄;422 参数缺失;
 * restoreItemEntry 随所选角色经 /api/account/restore-items 拉取(503 降级不阻塞)。
 */
export type CartParamField = "characterGuid" | "restoreItemEntry" | "unlockName" | "guildName" | "destAccount";

type RestorableItem = { entry: number; name: string | null };

const ERROR_MESSAGES: Record<string, string> = {
  PARAM_INVALID: "请先完整选择商品参数。",
  NO_HANDLER: "该商品暂不支持购买。",
  CHARACTER_NOT_OWNED: "所选角色不属于当前账号。",
  OUT_OF_STOCK: "该商品已售罄。",
  PRODUCT_NOT_FOUND: "商品不存在或已下架。",
  QTY_INVALID: "数量不合法。",
  GAME_DB_UNAVAILABLE: "游戏数据暂时不可用,请稍后重试。",
};

export function AddToCartForm({
  productId,
  fields,
  characters,
  loginHref,
  soldOut,
}: {
  productId: string;
  fields: CartParamField[];
  characters: CharacterOption[] | null;
  loginHref: string;
  soldOut?: boolean;
}) {
  const isGuest = characters === null;
  const [guid, setGuid] = useState("");
  const [restoreEntry, setRestoreEntry] = useState("");
  const [restorable, setRestorable] = useState<RestorableItem[] | null>(null);
  const [restoreDegraded, setRestoreDegraded] = useState(false);
  const [unlockName, setUnlockName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [destAccount, setDestAccount] = useState("");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const needRestore = fields.includes("restoreItemEntry");

  useEffect(() => {
    if (!needRestore || !guid) {
      setRestorable(null);
      return;
    }
    let alive = true;
    setRestoreDegraded(false);
    fetch(`/api/account/restore-items?guid=${guid}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (res.ok) setRestorable(body.items as RestorableItem[]);
        else setRestoreDegraded(true);
      })
      .catch(() => alive && setRestoreDegraded(true));
    return () => {
      alive = false;
    };
  }, [needRestore, guid]);

  if (isGuest) {
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-700 p-4">
        <p className="text-sm text-gray-300">登录后选择角色购买。</p>
        <Link
          href={loginHref}
          className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
        >
          去登录
        </Link>
      </div>
    );
  }

  async function submit() {
    setError(null);
    setOk(false);
    setBusy(true);
    try {
      const params: Record<string, unknown> = {};
      if (fields.includes("characterGuid")) params.characterGuid = Number(guid);
      if (needRestore) params.restoreItemEntry = Number(restoreEntry);
      if (fields.includes("unlockName")) params.unlockName = unlockName;
      if (fields.includes("guildName")) params.guildName = guildName;
      if (fields.includes("destAccount")) params.destAccount = destAccount;
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: Number(productId), qty, params }),
      });
      const body = await res.json();
      if (res.status === 401) {
        window.location.href = loginHref;
        return;
      }
      if (!res.ok) {
        setError(
          ERROR_MESSAGES[body?.error?.code as string] ?? (body?.error?.message as string) ?? "加购失败,请稍后重试。",
        );
        return;
      }
      setOk(true);
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    (!fields.includes("characterGuid") || guid !== "") &&
    (!needRestore || restoreEntry !== "");

  return (
    <div className="flex flex-col gap-3">
      {fields.includes("characterGuid") && (
        <CharacterSelect characters={characters} value={guid} onChange={setGuid} disabled={busy} />
      )}
      {needRestore && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">选择恢复物品</span>
          {restoreDegraded ? (
            <span className="text-amber-400">恢复物品列表暂不可用,请稍后重试。</span>
          ) : (
            <select
              value={restoreEntry}
              onChange={(e) => setRestoreEntry(e.target.value)}
              disabled={busy || !guid || restorable === null}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
            >
              <option value="">
                {restorable === null ? "请先选择角色" : restorable.length === 0 ? "该角色暂无可恢复物品" : "请选择恢复物品"}
              </option>
              {(restorable ?? []).map((it) => (
                <option key={it.entry} value={String(it.entry)}>
                  {it.name ?? `物品 #${it.entry}`}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      {fields.includes("unlockName") && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">目标名字</span>
          <input
            value={unlockName}
            onChange={(e) => setUnlockName(e.target.value)}
            disabled={busy}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </label>
      )}
      {fields.includes("guildName") && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">公会名</span>
          <input
            value={guildName}
            onChange={(e) => setGuildName(e.target.value)}
            disabled={busy}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </label>
      )}
      {fields.includes("destAccount") && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">目标账号</span>
          <input
            value={destAccount}
            onChange={(e) => setDestAccount(e.target.value)}
            disabled={busy}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </label>
      )}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-300">数量</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            disabled={busy}
            className="w-20 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || soldOut}
          className="rounded bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {soldOut ? "已售罄" : busy ? "加入中…" : "加入购物车"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm text-green-400">
          已加入购物车,<Link href="/cart" className="underline">去结算</Link>
        </p>
      )}
    </div>
  );
}
