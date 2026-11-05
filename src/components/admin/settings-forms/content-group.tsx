"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, useGroupSave } from "./common";

export function ContentGroup({ view }: { view: SettingsView["content"] }) {
  const [tocEnabled, setTocEnabled] = useState(view.tocEnabled);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="content"
      title="内容展示"
      description="正文目录跟随滚动的展示开关;关闭后文章/静态页不渲染目录,恢复单栏正文"
    >
      <CheckRow
        label="显示正文目录"
        hint="文章与静态页左侧目录列(移动端为正文顶部目录块)"
        testid="settings-field-content-tocEnabled"
        checked={tocEnabled}
        onChange={setTocEnabled}
      />
      <SaveBar
        group="content"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("content", { tocEnabled })}
      />
    </GroupSection>
  );
}
