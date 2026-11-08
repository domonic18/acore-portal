"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

/**
 * 外部工具站地址:rank 排行榜子站与 DKP 独立站。
 * 换环境/换站只改这里,不必改代码发版。
 */
export function ToolsGroup({ view }: { view: SettingsView["tools"] }) {
  const [rankBase, setRankBase] = useState(view.rankBase);
  const [dkpUrl, setDkpUrl] = useState(view.dkpUrl);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="tools"
      title="外部工具站"
      description="排行榜与 DKP 的站外地址;工具页以 iframe 嵌入,换站只改这里"
    >
      <TextRow label="排行榜地址" testid="settings-field-tools-rankBase" value={rankBase} onChange={setRankBase} />
      <TextRow label="DKP 地址" testid="settings-field-tools-dkpUrl" value={dkpUrl} onChange={setDkpUrl} />
      <SaveBar
        group="tools"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => {
          // 两个地址都有默认值(config 缺省回落到线上工具站),不存在「未配置」态,
          // 故留空=保持现值,不落空串(否则 schema 判非法 URL)
          void save("tools", {
            rankBase: rankBase.trim() === "" ? undefined : rankBase.trim(),
            dkpUrl: dkpUrl.trim() === "" ? undefined : dkpUrl.trim(),
          });
        }}
      />
    </GroupSection>
  );
}
