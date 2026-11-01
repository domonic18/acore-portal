"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

export function SecurityGroup({ view }: { view: SettingsView["security"] }) {
  const [loginMaxFails, setLoginMaxFails] = useState(String(view.loginMaxFails));
  const [loginWindowSec, setLoginWindowSec] = useState(String(view.loginWindowSec));
  const [loginLockSec, setLoginLockSec] = useState(String(view.loginLockSec));
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="security"
      title="登录防滥用"
      description="连续失败达阈值锁定账号;计数含不存在用户名(防探测枚举)"
    >
      <TextRow label="连续失败锁定阈值(次)" testid="settings-field-security-loginMaxFails" value={loginMaxFails} onChange={setLoginMaxFails} />
      <TextRow label="计数窗口(秒)" testid="settings-field-security-loginWindowSec" value={loginWindowSec} onChange={setLoginWindowSec} />
      <TextRow label="锁定时长(秒)" testid="settings-field-security-loginLockSec" value={loginLockSec} onChange={setLoginLockSec} />
      <SaveBar
        group="security"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("security", { loginMaxFails, loginWindowSec, loginLockSec })}
      />
    </GroupSection>
  );
}
