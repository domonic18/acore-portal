"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

export function SiteGroup({ view }: { view: SettingsView["site"] }) {
  const [icp, setIcp] = useState(view.icp);
  const [qqGroup, setQqGroup] = useState(view.qqGroup);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="site"
      title="站点信息"
      description="页脚备案号与联系方式;备案号留空=页脚不显示备案链接"
    >
      <TextRow label="ICP 备案号" testid="settings-field-site-icp" value={icp} onChange={setIcp} placeholder="京ICP备…(留空隐藏)" />
      <TextRow label="QQ 群号" testid="settings-field-site-qqGroup" value={qqGroup} onChange={setQqGroup} placeholder="留空隐藏" />
      <SaveBar
        group="site"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("site", { icp, qqGroup })}
      />
    </GroupSection>
  );
}
