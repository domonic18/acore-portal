"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { MediaPickerField } from "@/components/admin/media-picker-field";
import { errorMessage, requestJson } from "@/lib/api-client";
import type { SettingsView } from "@/lib/settings-types";
import {
  THEME_DESCRIPTIONS,
  THEME_IDS,
  THEME_LABELS,
  THEME_PREVIEW_COOKIE,
  THEME_SWATCHES,
  THEME_THUMBNAIL,
  type ThemeId,
} from "@/constants/theme";

/**
 * 站点主题管理(2026-11-19 独立菜单页):
 * 主题卡 = 缩略图 + 色板条 + 「当前使用」/「启用此主题」+「整页预览」。
 *
 * 启用 = PUT theme 组 {active},保存即热生效(刷新前台即换肤);
 * 背景图(页头/页面/面板)按主题分别配置,留空=回落 appearance 组通用背景,
 * 面板位留空=纯色底(见 services/site/theme.ts 的取数口径)。
 *
 * 整页预览:写一枚短期 cookie 后新开前台页——只影响当前浏览器,
 * 不改库里的当前主题(预览完刷新即回落)。
 */

type ThemeView = SettingsView["theme"];
type ThemeAssets = ThemeView["assets"][ThemeId];

const PREVIEW_COOKIE_MAX_AGE = 1800;

function Thumbnail({ id }: { id: ThemeId }) {
  const c = THEME_THUMBNAIL[id];
  return (
    <div
      className="h-[118px] overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${c.page} 0%, #05090f 100%)` }}
      aria-hidden
    >
      <div
        className="flex h-[26px] items-center gap-1.5 border-b px-2.5"
        style={{ background: c.header, borderColor: c.headerLine }}
      >
        <span className="h-2 w-11 rounded-[3px]" style={{ background: c.brand }} />
        <span className="ml-auto flex gap-1.5">
          <i className="h-1.5 w-4 rounded-[3px]" style={{ background: c.nav }} />
          <i className="h-1.5 w-4 rounded-[3px]" style={{ background: c.nav }} />
          <i className="h-1.5 w-4 rounded-[3px]" style={{ background: c.nav }} />
        </span>
      </div>
      <div
        className="mx-2.5 mt-3 flex h-10 items-center rounded-md border px-2.5"
        style={{ borderColor: c.heroBorder, background: `linear-gradient(90deg, ${c.heroBorder}55, ${c.card})` }}
      >
        <span className="h-2.5 w-[90px] rounded-[3px]" style={{ background: c.heroText }} />
      </div>
      <div className="mx-2.5 mt-2.5 flex gap-2">
        <i className="h-[26px] flex-1 rounded-[5px] border" style={{ background: c.card, borderColor: c.cardLine }} />
        <i className="h-[26px] flex-1 rounded-[5px] border" style={{ background: c.card, borderColor: c.cardLine }} />
        <i className="h-[26px] flex-1 rounded-[5px] border" style={{ background: c.card, borderColor: c.cardLine }} />
      </div>
    </div>
  );
}

function AssetEditor({
  id,
  assets,
  onChange,
  onSave,
  busy,
  saved,
  error,
}: {
  id: ThemeId;
  assets: ThemeAssets;
  onChange: (slot: keyof ThemeAssets, url: string) => void;
  onSave: () => void;
  busy: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
      <p className="text-[11.5px] leading-relaxed text-muted">
        {THEME_LABELS[id]} 的背景图:留空 = 回落「设置 → 常规 → 站点外观」的通用背景(面板位无回落项,留空 = 纯色底)。
      </p>
      <div className="flex flex-col gap-2">
        <span className="flex flex-col gap-1 text-[11.5px] text-muted">
          页头背景图
          <span data-testid={`theme-asset-${id}-header`}>
            <MediaPickerField
              value={assets.headerBackgroundUrl}
              onChange={(url) => onChange("headerBackgroundUrl", url)}
            />
          </span>
        </span>
        <span className="flex flex-col gap-1 text-[11.5px] text-muted">
          页面背景图
          <span data-testid={`theme-asset-${id}-page`}>
            <MediaPickerField
              value={assets.pageBackgroundUrl}
              onChange={(url) => onChange("pageBackgroundUrl", url)}
            />
          </span>
        </span>
        <span className="flex flex-col gap-1 text-[11.5px] text-muted">
          内容面板背景图
          <span data-testid={`theme-asset-${id}-panel`}>
            <MediaPickerField
              value={assets.panelBackgroundUrl}
              onChange={(url) => onChange("panelBackgroundUrl", url)}
            />
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button
          data-testid={`theme-save-assets-${id}`}
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={onSave}
        >
          {busy ? "保存中…" : "保存背景图"}
        </Button>
        {error ? (
          <span role="alert" className="text-[11.5px] text-danger">
            {error}
          </span>
        ) : saved ? (
          <span className="text-[11.5px] text-ok-bright">已保存,即时生效</span>
        ) : null}
      </div>
    </div>
  );
}

export function ThemeManager({ view }: { view: ThemeView }) {
  const router = useRouter();
  const [assets, setAssets] = useState<Record<ThemeId, ThemeAssets>>(view.assets);
  const [expanded, setExpanded] = useState<ThemeId | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function put(values: Record<string, unknown>) {
    await requestJson("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group: "theme", values }),
    });
  }

  async function activate(id: ThemeId) {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await put({ active: id });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAssets(id: ThemeId) {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    const current = assets[id];
    try {
      await put({
        [`${id}.headerBackgroundUrl`]: current.headerBackgroundUrl,
        [`${id}.pageBackgroundUrl`]: current.pageBackgroundUrl,
        [`${id}.panelBackgroundUrl`]: current.panelBackgroundUrl,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function setSlot(id: ThemeId, slot: keyof ThemeAssets, url: string) {
    setAssets((prev) => ({ ...prev, [id]: { ...prev[id], [slot]: url } }));
  }

  /** 整页预览:写短期 cookie 后新开前台页(仅当前浏览器生效,不改库里的当前主题) */
  function preview(id: ThemeId) {
    document.cookie = `${THEME_PREVIEW_COOKIE}=${id}; path=/; max-age=${PREVIEW_COOKIE_MAX_AGE}; samesite=lax`;
    window.open("/", "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        全站配色主题;切换即时生效(刷新前台即换肤)。缩略图为该主题的站点概貌,更多主题后续在此扩充。
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {THEME_IDS.map((id) => {
          const isActive = view.active === id;
          return (
            <section
              key={id}
              data-testid={`theme-card-${id}`}
              className={`overflow-hidden rounded-xl border bg-panel-strong ${
                isActive ? "border-highlight/50" : "border-line"
              }`}
            >
              <Thumbnail id={id} />
              <div className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13.5px] font-semibold text-heading">{THEME_LABELS[id]}</h2>
                  {isActive ? (
                    <span
                      data-testid={`theme-current-${id}`}
                      className="rounded-full bg-highlight/12 px-2 py-0.5 text-[11px] text-highlight"
                    >
                      ● 当前使用
                    </span>
                  ) : null}
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted">{THEME_DESCRIPTIONS[id]}</p>
                <div className="flex items-center gap-1.5">
                  {THEME_SWATCHES[id].map((color) => (
                    <i
                      key={color}
                      className="h-4 w-4 rounded-[5px] border border-white/10"
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {isActive ? (
                    <span
                      data-testid={`theme-enabled-${id}`}
                      className="text-[11.5px] text-ok-bright"
                    >
                      生效中
                    </span>
                  ) : (
                    <Button
                      data-testid={`theme-activate-${id}`}
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void activate(id)}
                    >
                      启用此主题
                    </Button>
                  )}
                  <Button
                    data-testid={`theme-preview-${id}`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => preview(id)}
                  >
                    整页预览
                  </Button>
                  <Button
                    data-testid={`theme-assets-toggle-${id}`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded((prev) => (prev === id ? null : id))}
                  >
                    背景图
                  </Button>
                </div>
                {error ? (
                  <span role="alert" className="text-[11.5px] text-danger">
                    {error}
                  </span>
                ) : null}
              </div>
              {expanded === id ? (
                <AssetEditor
                  id={id}
                  assets={assets[id]}
                  onChange={(slot, url) => setSlot(id, slot, url)}
                  onSave={() => void saveAssets(id)}
                  busy={busy}
                  saved={saved}
                  error={null}
                />
              ) : null}
            </section>
          );
        })}

        <section className="rounded-xl border border-line bg-panel-strong opacity-70">
          <div
            className="flex h-[118px] items-center justify-center text-[12px] text-muted"
            style={{
              background:
                "repeating-linear-gradient(45deg, #0c1626, #0c1626 10px, #0f1d31 10px, #0f1d31 20px)",
            }}
          >
            更多主题规划中…
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            <h2 className="text-[13.5px] font-semibold text-muted">CTM / Vanilla 系列候选</h2>
            <p className="text-[11.5px] leading-relaxed text-muted">
              后续按需扩充;新增主题 = 一套色板 token + 一张缩略图,页面结构不变。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
