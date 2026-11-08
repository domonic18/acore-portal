"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import { ITEM_QUALITY_COLOR } from "@/constants/shop";
import { SERVICE_HANDLER_OPTIONS } from "@/constants/shop-sku";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { FormField } from "./field";
import type { ProductFieldErrors } from "./validation";

/**
 * 物品 / 服务 选择器(商品编辑页「基本信息」区的核心):
 * 物品类——按物品ID 或名称检索 world.item_template,选中即自动派生 itemsend_{物品ID};
 *          可堆叠物品(stackable>1)自动派生 _stack 后缀(一封邮件发多个);
 * 服务类——从发货处理器注册表的 6 个键里下拉选择(handler_key),SKU 只是唯一标识。
 * SKU 默认只读,高级区可手动改写(改写后实时校验与服务端二次校验)。
 */

type GameItemHit = {
  entry: number;
  name: string | null;
  /** 中文名(issue #151);游戏库无本地化表时为 null */
  nameZh: string | null;
  quality: number | null;
  stackable: number | null;
};

function qualityColor(quality: number | null): string {
  if (quality == null) return "#9d9d9d";
  return ITEM_QUALITY_COLOR[quality] ?? "#9d9d9d";
}

/** 主名优先中文,回落英文 */
function primaryName(hit: { name: string | null; nameZh: string | null }): string {
  return hit.nameZh || hit.name || "(未命名物品)";
}

/** 副名:英文名与主名不同时并列展示,便于核对 */
function secondaryName(hit: { name: string | null; nameZh: string | null }): string | null {
  if (!hit.name || !hit.nameZh || hit.name === hit.nameZh) return null;
  return hit.name;
}

/** 可堆叠判定(AC 真表 stackable=最大堆叠数,1=不可堆叠) */
function isStackable(hit: { stackable: number | null } | null): boolean {
  return (hit?.stackable ?? 1) > 1;
}

export function ItemPicker({
  type,
  sku,
  handlerKey,
  gameItemId,
  stack,
  skuOverride,
  errors,
  onSelectItem,
  onSelectService,
  onToggleStack,
  onEnableOverride,
  onDisableOverride,
  onSkuChange,
  onUnavailable,
}: {
  type: string;
  sku: string;
  handlerKey: string | null;
  gameItemId: number | null;
  stack: boolean;
  skuOverride: boolean;
  errors: ProductFieldErrors;
  onSelectItem: (entry: number, name: string | null, stackable: number | null) => void;
  onSelectService: (key: string) => void;
  onToggleStack: (next: boolean) => void;
  onEnableOverride: () => void;
  onDisableOverride: () => void;
  onSkuChange: (value: string) => void;
  onUnavailable: (unavailable: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GameItemHit[]>([]);
  const [current, setCurrent] = useState<GameItemHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      setLoading(true);
      setSearchError(null);
      try {
        const data = await requestJson<{ items: GameItemHit[] }>(
          `/api/admin/game-items?q=${encodeURIComponent(query)}`,
        );
        setItems(data.items ?? []);
      } catch (err) {
        setItems([]);
        const unavailable = err instanceof ApiRequestError && err.code === "GAME_DB_UNAVAILABLE";
        setSearchError(unavailable ? "游戏数据暂时不可用,请稍后重试。" : "检索失败,请重试。");
        onUnavailable(unavailable);
      } finally {
        setLoading(false);
      }
    },
    [onUnavailable],
  );

  useEffect(() => {
    if (type !== "game_item") return;
    const timer = setTimeout(() => {
      void runSearch(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, runSearch, type]);

  // 编辑既有商品时补出当前物品的名称与可堆叠性(检索不到不影响编辑,只是少一行说明)
  useEffect(() => {
    if (type !== "game_item" || gameItemId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await requestJson<{ items: GameItemHit[] }>(
          `/api/admin/game-items?q=${gameItemId}`,
        );
        if (!cancelled) setCurrent(data.items?.[0] ?? null);
      } catch {
        /* 静默 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameItemId, type]);

  const skuField = (
    <FormField
      label={type === "service" ? "SKU(商品唯一标识)" : "SKU(发货唯一依据)"}
      required
      error={errors.sku}
      hint={
        skuOverride
          ? undefined
          : type === "service"
            ? "默认取所选发货处理器键;复制商品会自动追加 -copy 后缀"
            : "由所选物品自动生成,不可手改"
      }
    >
      <Input
        value={sku}
        onChange={(e) => onSkuChange(e.target.value)}
        readOnly={!skuOverride}
        aria-label="SKU"
        className={skuOverride ? "" : "opacity-70"}
      />
    </FormField>
  );

  const overrideControls = skuOverride ? (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#e8c877]">
        高级模式:手改 SKU 不会改变所选物品,保存时服务端仍会核对两者是否一致。
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onDisableOverride}>
        恢复自动生成
      </Button>
    </div>
  ) : (
    <Button type="button" variant="ghost" size="sm" onClick={onEnableOverride}>
      高级:手动改写 SKU
    </Button>
  );

  if (type === "service") {
    const known = SERVICE_HANDLER_OPTIONS.some((o) => o.key === handlerKey);
    return (
      <div className="flex flex-col gap-2">
        <FormField label="服务类型(发货处理器)" required error={errors.sku}>
          <Select
            value={handlerKey ?? ""}
            onChange={(e) => onSelectService(e.target.value)}
            aria-label="服务类型"
          >
            {!known && handlerKey && (
              <option value={handlerKey}>{handlerKey}(历史自定义键)</option>
            )}
            {SERVICE_HANDLER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}({o.key})
              </option>
            ))}
          </Select>
        </FormField>
        {skuField}
        {overrideControls}
        <p className="text-xs text-[#6482a3]">
          服务类由所选处理器发货;SKU 只是商品唯一标识(可与处理器键不同),不影响发货。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-[#93b2ce]">游戏物品 *</span>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="按物品 ID 或名称搜索(如 19019 / 坐骑 / 中文名)"
          aria-label="搜索游戏物品"
        />
        {searchError && (
          <span role="alert" className="text-xs text-[#eda9a9]">
            {searchError}
          </span>
        )}
        {errors.gameItemId && (
          <span role="alert" className="text-xs text-[#eda9a9]">
            {errors.gameItemId}
          </span>
        )}
      </div>

      {loading && <span className="text-xs text-[#6482a3]">检索中…</span>}

      {items.length > 0 && (
        <ul
          className="max-h-56 overflow-y-auto rounded-lg border border-[#22385a] bg-[#0b1526] p-1"
          aria-label="游戏物品检索结果"
        >
          {items.map((item) => (
            <li key={item.entry}>
              <button
                type="button"
                data-testid={`game-item-option-${item.entry}`}
                onClick={() => {
                  setCurrent(item);
                  onSelectItem(item.entry, item.name, item.stackable);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-[#13233a] ${FOCUS_RING}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: qualityColor(item.quality) }}
                />
                <span className="w-20 shrink-0 font-mono text-[#93b2ce]">#{item.entry}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[#dcebf7]">{primaryName(item)}</span>
                  {secondaryName(item) && (
                    <span className="block truncate text-[11px] text-[#6482a3]">{item.name}</span>
                  )}
                </span>
                {isStackable(item) && (
                  <span className="shrink-0 rounded bg-[#1d3557] px-1.5 py-0.5 text-[11px] text-[#8fd3f4]">
                    可堆叠
                  </span>
                )}
                {item.entry === gameItemId && <span className="text-xs text-[#6ee7b7]">已选</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {gameItemId != null && (
        <div className="rounded-lg border border-[#22385a] bg-[#0b1526] px-3 py-2 text-[13px]">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: qualityColor(current?.quality ?? null) }}
            />
            <span className="font-mono text-[#93b2ce]">#{gameItemId}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[#dcebf7]">
                {current ? primaryName(current) : "(名称未知,可在高级区改写 SKU)"}
              </span>
              {current && secondaryName(current) && (
                <span className="block truncate text-[11px] text-[#6482a3]">{current.name}</span>
              )}
            </span>
            {isStackable(current) && (
              <span className="shrink-0 rounded bg-[#1d3557] px-1.5 py-0.5 text-[11px] text-[#8fd3f4]">
                可堆叠 ×{current?.stackable}
              </span>
            )}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-[13px] text-[#93b2ce]">
        <Switch checked={stack} onChange={onToggleStack} ariaLabel="一封邮件发多个" />
        <span>一封邮件发多个(_stack 形态;可堆叠物品已自动勾选)</span>
      </label>

      {skuField}
      {overrideControls}
    </div>
  );
}
