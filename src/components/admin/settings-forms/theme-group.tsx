"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { THEME_IDS, THEME_LABELS, type ThemeId } from "@/constants/theme";
import { MediaPickerField } from "@/components/admin/media-picker-field";
import { GroupSection, SaveBar, useGroupSave } from "./common";

/**
 * 站点主题设置(2026-11-06 主题系统):
 * 选择当前主题(TBC 暖 / WLK 冷),并为每套主题配置页头/页面/面板背景图;
 * 背景图留空=回落「站点外观」组的通用背景(面板无对应项,留空=纯色底)。
 * 保存即热生效(system_config theme.active + reloadSystemConfig,刷新即换肤)。
 */
export function ThemeGroup({ view }: { view: SettingsView["theme"] }) {
  const [active, setActive] = useState<ThemeId>(view.active);
  const [assets, setAssets] = useState(view.assets);
  const { busy, saved, error, save } = useGroupSave();

  function setSlot(theme: ThemeId, slot: keyof SettingsView["theme"]["assets"][ThemeId], url: string) {
    setAssets((prev) => ({
      ...prev,
      [theme]: { ...prev[theme], [slot]: url },
    }));
  }

  const current = assets[active];

  return (
    <GroupSection
      name="theme"
      title="站点主题"
      description="切换 TBC 暖色 / WLK 冷色两套色板,并可为每套主题单独配置背景图;保存后刷新即生效"
    >
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-[#93b2ce]">当前主题</span>
        <div className="flex items-center gap-4">
          {THEME_IDS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="settings-theme-active"
                data-testid={`settings-field-theme-active-${id}`}
                value={id}
                checked={active === id}
                onChange={() => setActive(id)}
              />
              <span>{THEME_LABELS[id]}</span>
            </label>
          ))}
        </div>
      </div>

      <span className="flex flex-col gap-1 text-xs text-[#93b2ce]">
        {THEME_LABELS[active]} · 页头背景图(留空=用站点外观设置)
        <MediaPickerField
          value={current.headerBackgroundUrl}
          onChange={(url) => setSlot(active, "headerBackgroundUrl", url)}
        />
      </span>
      <span className="flex flex-col gap-1 text-xs text-[#93b2ce]">
        {THEME_LABELS[active]} · 页面背景图(留空=用站点外观设置)
        <MediaPickerField
          value={current.pageBackgroundUrl}
          onChange={(url) => setSlot(active, "pageBackgroundUrl", url)}
        />
      </span>
      <span className="flex flex-col gap-1 text-xs text-[#93b2ce]">
        {THEME_LABELS[active]} · 内容面板背景图(留空=纯色底)
        <MediaPickerField
          value={current.panelBackgroundUrl}
          onChange={(url) => setSlot(active, "panelBackgroundUrl", url)}
        />
      </span>

      <SaveBar
        group="theme"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save("theme", {
            active,
            "tbc.headerBackgroundUrl": assets.tbc.headerBackgroundUrl,
            "tbc.pageBackgroundUrl": assets.tbc.pageBackgroundUrl,
            "tbc.panelBackgroundUrl": assets.tbc.panelBackgroundUrl,
            "wlk.headerBackgroundUrl": assets.wlk.headerBackgroundUrl,
            "wlk.pageBackgroundUrl": assets.wlk.pageBackgroundUrl,
            "wlk.panelBackgroundUrl": assets.wlk.panelBackgroundUrl,
          })
        }
      />
    </GroupSection>
  );
}
