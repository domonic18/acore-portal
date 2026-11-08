"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

/**
 * 备份脚本参数:cron 备份脚本每次运行都从 system_config 读这两项,
 * 改保留期不必手改库。
 */
export function BackupGroup({ view }: { view: SettingsView["backup"] }) {
  const [retentionDays, setRetentionDays] = useState(String(view.retentionDays));
  const [gameWeekly, setGameWeekly] = useState(view.gameWeekly);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="backup"
      title="备份策略"
      description="备份保留天数与游戏库周备份开关;cron 备份脚本每次运行即读这两项"
    >
      <TextRow
        label="保留天数"
        testid="settings-field-backup-retentionDays"
        value={retentionDays}
        onChange={setRetentionDays}
        type="number"
      />
      <CheckRow
        label="游戏库周备份"
        hint="每周日的全库备份"
        testid="settings-field-backup-gameWeekly"
        checked={gameWeekly}
        onChange={setGameWeekly}
      />
      <SaveBar
        group="backup"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => {
          const raw = retentionDays.trim();
          void save("backup", {
            // 留空=保持现值(不落 0):0 在备份脚本里表示「只留当日」
            retentionDays: raw === "" ? undefined : Number(raw),
            gameWeekly,
          });
        }}
      />
    </GroupSection>
  );
}
