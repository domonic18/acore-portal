"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

export function NotifyGroup({ view }: { view: SettingsView["notify"] }) {
  const [threshold, setThreshold] = useState(String(view.pointEmailThreshold));
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection name="notify" title="通知" description="积分变动邮件通知阈值">
      <TextRow
        label="积分变动邮件阈值(0=关闭)"
        testid="settings-field-notify-pointEmailThreshold"
        value={threshold}
        onChange={setThreshold}
      />
      <SaveBar
        group="notify"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("notify", { pointEmailThreshold: threshold })}
      />
    </GroupSection>
  );
}
