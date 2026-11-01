"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

export function AppearanceGroup({ view }: { view: SettingsView["appearance"] }) {
  const [logoUrl, setLogoUrl] = useState(view.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(view.faviconUrl);
  const [headerBackgroundUrl, setHeaderBackgroundUrl] = useState(view.headerBackgroundUrl);
  const [pageBackgroundUrl, setPageBackgroundUrl] = useState(view.pageBackgroundUrl);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="appearance"
      title="站点外观"
      description="favicon / 页头 logo / 页头与页面背景图;填站内路径或 http(s) 图片地址,保存后即时生效"
    >
      <TextRow
        label="站点 logo"
        testid="settings-field-appearance-logoUrl"
        value={logoUrl}
        onChange={setLogoUrl}
        placeholder="/logo.png(留空用内置)"
      />
      <TextRow
        label="favicon 图标"
        testid="settings-field-appearance-faviconUrl"
        value={faviconUrl}
        onChange={setFaviconUrl}
        placeholder="/favicon-32.png(留空用内置)"
      />
      <TextRow
        label="页头背景图"
        testid="settings-field-appearance-headerBackgroundUrl"
        value={headerBackgroundUrl}
        onChange={setHeaderBackgroundUrl}
        placeholder="/background.jpg(留空不显示)"
      />
      <TextRow
        label="页面背景图"
        testid="settings-field-appearance-pageBackgroundUrl"
        value={pageBackgroundUrl}
        onChange={setPageBackgroundUrl}
        placeholder="/background.jpg(留空不显示)"
      />
      <SaveBar
        group="appearance"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save("appearance", { logoUrl, faviconUrl, headerBackgroundUrl, pageBackgroundUrl })
        }
      />
    </GroupSection>
  );
}
