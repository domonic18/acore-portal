"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function SmtpGroup({ view }: { view: SettingsView["smtp"] }) {
  const [host, setHost] = useState(view.host);
  const [port, setPort] = useState(String(view.port));
  const [user, setUser] = useState(view.user);
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(view.from);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="smtp"
      title="SMTP 邮件"
      description="注册激活/密码重置/积分通知的发信通道;改密码留空=保持原密码"
    >
      <TextRow label="SMTP 主机" testid="settings-field-smtp-host" value={host} onChange={setHost} />
      <TextRow label="SMTP 端口(465=SSL)" testid="settings-field-smtp-port" value={port} onChange={setPort} />
      <TextRow label="用户名" testid="settings-field-smtp-user" value={user} onChange={setUser} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">密码</span>
        <SecretInput
          testid="settings-field-smtp-password"
          configured={view.passwordConfigured}
          value={password}
          onChange={setPassword}
        />
      </label>
      <TextRow label="发件人地址" testid="settings-field-smtp-from" value={from} onChange={setFrom} />
      <SaveBar
        group="smtp"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("smtp", { host, port, user, password, from })) setPassword("");
        }}
      />
    </GroupSection>
  );
}
