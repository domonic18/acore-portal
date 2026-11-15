"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

/**
 * 备份脚本参数:cron 备份脚本每次运行都从 system_config 读保留天数,
 * 改保留期不必手改库。
 *
 * 覆盖范围(门户站点侧):业务库每日;WP 存量存档库只在上线时备一次(已冻结,不排期);
 * 游戏四库由游戏侧部署工程每日备份,不在本机制内。
 */
export function BackupGroup({ view }: { view: SettingsView["backup"] }) {
  const [retentionDays, setRetentionDays] = useState(String(view.retentionDays));
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="backup"
      title="备份策略"
      description="业务库备份保留天数(上限 365 天,与 COS 桶生命周期兜底线一致);cron 备份脚本每次运行即读这一项(游戏四库由游戏侧部署工程每日备份,不在此列)"
    >
      <TextRow
        label="保留天数"
        testid="settings-field-backup-retentionDays"
        value={retentionDays}
        onChange={setRetentionDays}
        type="number"
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
          });
        }}
      />
    </GroupSection>
  );
}
