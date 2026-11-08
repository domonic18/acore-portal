"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

export function AppGroup({ view }: { view: SettingsView["app"] }) {
  const [url, setUrl] = useState(view.url);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="app"
      title="站点地址"
      description="站点对外访问地址(生产与测试环境各自不同);保存后立即生效"
    >
      <TextRow label="站点地址" testid="settings-field-app-url" value={url} onChange={setUrl} />
      <SaveBar
        group="app"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => {
          void save("app", { url });
        }}
      />
    </GroupSection>
  );
}
