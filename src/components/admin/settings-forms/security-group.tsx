"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextRow, useGroupSave } from "./common";

/**
 * 安全与防滥用阈值(2026-11-06 撞库加固):
 * 账号维(连错锁号)与 IP 维(越阈只锁攻击源 IP,不牵连账号)各自独立可调;
 * 共享出口(NAT)若被误伤,优先调高 IP 硬阈或缩短 IP 锁时长。
 * 未鉴权端点(注册/找回/换邮箱确认)另有按 IP 的小时级限速;
 * 「未知 IP 兜底桶」在 IP 不可判定(代理未配置/直连)时生效——
 * 此时所有请求并成一个共享桶,阈值必须留足余量,否则会误伤全站。
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
  ["registerIpMaxPerHour", "注册按 IP 限速(次/小时)"],
  ["pwresetIpMaxPerHour", "找回密码按 IP 限速(次/小时)"],
  ["emailChangeIpMaxPerHour", "换邮箱确认按 IP 限速(次/小时)"],
  ["unknownIpMaxPerHour", "未知 IP 兜底桶(次/小时)"],
  ["statusIpMaxPerMin", "状态页按 IP 限速(次/分)"],
  ["statusGlobalMaxPerMin", "状态页全局限速(次/分)"],
  ["statusUnknownIpMaxPerMin", "状态页未知 IP 兜底桶(次/分)"],
  ["artviewIpMaxPerMin", "阅读计数按 IP 总闸(次/分)"],
  ["artviewArticleMax", "同一 IP 对同一篇的计入上限(次/窗口)"],
  ["artviewArticleWindowSec", "阅读计数计入窗口(秒)"],
  ["trackUnknownIpMaxPerMin", "埋点上报未知 IP 兜底桶(次/分)"],
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
      title="安全与防滥用"
      description="账号维连错达阈锁定账号;IP 维达阈只锁攻击源 IP(不牵连账号),越软阈先降速;注册/找回/换邮箱确认另有按 IP 的小时级限速"
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
