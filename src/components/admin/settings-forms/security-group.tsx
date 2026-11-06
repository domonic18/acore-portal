"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

/**
 * 登录防滥用阈值(2026-11-06 撞库加固):
 * 账号维(连错锁号)与 IP 维(越阈只锁攻击源 IP,不牵连账号)各自独立可调;
 * 共享出口(NAT)若被误伤,优先调高 IP 硬阈或缩短 IP 锁时长。
 */
const FIELDS = [
  ["loginMaxFails", "连续失败锁定阈值(次)"],
  ["loginWindowSec", "计数窗口(秒)"],
  ["loginLockSec", "账号锁定时长(秒)"],
  ["loginIpSoftFails", "IP 软阈(次,越阈仅降速)"],
  ["loginIpMaxFails", "IP 硬阈(次,越阈锁该 IP)"],
  ["loginIpLockSec", "IP 锁定时长(秒)"],
  ["loginSoftLockSec", "IP 软锁串行时长(秒)"],
  ["loginGlobalMaxPerMin", "全局哈希预算(次/分)"],
  ["loginMaxConcurrent", "并发哈希上限(个)"],
  ["loginQueueWaitMs", "哈希排队等待上限(毫秒)"],
  ["loginUnknownIpMaxPerMin", "未知 IP 兜底桶(次/分)"],
  ["trustedProxyHops", "可信代理跳数(XFF 右起 N 跳)"],
] as const;

export function SecurityGroup({ view }: { view: SettingsView["security"] }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(([key]) => [key, String(view[key])])),
  );
  const { busy, saved, error, save } = useGroupSave();
  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <GroupSection
      name="security"
      title="登录防滥用"
      description="账号维连错达阈锁定账号;IP 维达阈只锁攻击源 IP(不牵连账号),越软阈先降速"
    >
      {FIELDS.map(([key, label]) => (
        <TextRow
          key={key}
          label={label}
          testid={`settings-field-security-${key}`}
          value={values[key] ?? ""}
          onChange={set(key)}
        />
      ))}
      <SaveBar
        group="security"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("security", values)}
      />
    </GroupSection>
  );
}
