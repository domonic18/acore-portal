"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ITEM_QUALITY_COLOR } from "@/constants/shop";
import { ApiRequestError, errorMessage, requestJson } from "@/lib/api-client";
import { CharacterSelect, type CharacterOption } from "./character-select";

/**
 * 加购表单(客户端交互面):POST /api/cart 契约映射——
 * 401 跳登录引导(FR-111/112);403 越权提示;409 售罄;422 参数缺失;
 * restoreItemEntry 随所选角色经 /api/account/restore-items 拉取(503 降级不阻塞),
 * 质量色渲染+数据缺失行禁选(restorable=false,T041);未选物品不得加购。
 */
export type CartParamField = "characterGuid" | "restoreItemEntry" | "unlockName";

type RestorableItem = {
  entry: number;
  name: string | null;
  quality: number | null;
  restorable: boolean;
};

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
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  // 加购成功后的短暂冷却 + 提交中互斥:防连点导致同一商品被重复加购(issue #30)
  const [cooldown, setCooldown] = useState(false);
  const inFlight = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );

  const needRestore = fields.includes("restoreItemEntry");

  useEffect(() => {
    if (!needRestore || !guid) {
      setRestorable(null);
      return;
    }
    let alive = true;
    setRestoreDegraded(false);
    requestJson<{ items: RestorableItem[] }>(`/api/account/restore-items?guid=${guid}`)
      .then((body) => {
        if (alive) setRestorable(body.items);
      })
      .catch(() => {
        if (alive) setRestoreDegraded(true);
      });
    return () => {
      alive = false;
    };
  }, [needRestore, guid]);

  if (isGuest) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-[#22385a] p-4">
        <p className="text-sm text-[#c7d5e6]">登录后选择角色购买。</p>
        <Link
          href={loginHref}
          className="w-fit rounded-md bg-[#5ea3cc] px-4 py-2 text-sm font-medium text-[#0a1220] hover:bg-[#6fb7e0]"
        >
          去登录
        </Link>
      </div>
    );
  }

  async function submit() {
    if (inFlight.current || cooldown) return;
    inFlight.current = true;
    setError(null);
    setOk(false);
    setBusy(true);
    try {
      const params: Record<string, unknown> = {};
      if (fields.includes("characterGuid")) params.characterGuid = Number(guid);
      if (needRestore) params.restoreItemEntry = Number(restoreEntry);
      if (fields.includes("unlockName")) params.unlockName = unlockName;
      await requestJson("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: Number(productId), qty, params }),
      });
      setOk(true);
      setCooldown(true);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      cooldownTimer.current = setTimeout(() => setCooldown(false), 1500);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        window.location.href = loginHref;
        return;
      }
      const known = err instanceof ApiRequestError && err.code ? ERROR_MESSAGES[err.code] : undefined;
      if (known) {
        setError(known);
        return;
      }
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    !cooldown &&
    (!fields.includes("characterGuid") || guid !== "") &&
    (!needRestore || restoreEntry !== "");

  return (
    <div className="flex flex-col gap-3">
      {fields.includes("characterGuid") && (
        <CharacterSelect characters={characters} value={guid} onChange={setGuid} disabled={busy} />
      )}
      {needRestore && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="text-[#c7d5e6]">选择恢复物品</legend>
          {restoreDegraded ? (
            <span className="text-amber-400">恢复物品列表暂不可用,请稍后重试。</span>
          ) : restorable === null ? (
            <span className="text-[#6482a3]">请先选择角色。</span>
          ) : restorable.length === 0 ? (
            <span className="text-[#6482a3]">该角色暂无可恢复物品。</span>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-[#22385a] bg-[#0d1828] p-2">
              {restorable.map((it) => (
                <label
                  key={it.entry}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                    it.restorable ? "cursor-pointer hover:bg-[#13233a]" : "opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreItemEntry"
                    value={String(it.entry)}
                    checked={restoreEntry === String(it.entry)}
                    onChange={(e) => setRestoreEntry(e.target.value)}
                    disabled={busy || !it.restorable}
                    className="accent-[#5ea3cc]"
                  />
                  <span aria-hidden className="text-base leading-none">⚔</span>
                  <span
                    className="font-medium"
                    style={{ color: ITEM_QUALITY_COLOR[it.quality ?? 1] ?? "#ffffff" }}
                  >
                    {it.name ?? `物品 #${it.entry}`}
                  </span>
                  {!it.restorable && <span className="text-xs text-[#6482a3]">(数据缺失,暂不可恢复)</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {fields.includes("unlockName") && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#c7d5e6]">目标名字</span>
          <input
            value={unlockName}
            onChange={(e) => setUnlockName(e.target.value)}
            disabled={busy}
            className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
          />
        </label>
      )}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[#c7d5e6]">数量</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            disabled={busy}
            className="w-20 rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || soldOut}
          className="rounded-md bg-[#5ea3cc] px-6 py-2 font-semibold text-[#0a1220] hover:bg-[#6fb7e0] disabled:opacity-50"
        >
          {soldOut ? "已售罄" : busy ? "加入中…" : cooldown ? "已加入 ✓" : "加入购物车"}
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
