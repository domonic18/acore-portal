"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsView } from "@/lib/settings-types";

/**
 * 五组设置表单+测试发信卡片(T032;api-admin-m4 契约)。
 * 敏感字段(smtp.password/turnstile.secretKey/umami.apiPassword)只写不读:
 * 已配置显「已配置,留空保持」占位,空提交=保持原值,非空=覆写。
 */

type GroupName = "smtp" | "turnstile" | "security" | "notify" | "site" | "download" | "umami";

function SecretInput({
  testid,
  configured,
  value,
  onChange,
}: {
  testid: string;
  configured: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      data-testid={testid}
      type="password"
      autoComplete="new-password"
      value={value}
      placeholder={configured ? "已配置,留空保持" : "未配置"}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
    />
  );
}

function TextRow({
  label,
  testid,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
      <span className="w-56 shrink-0 text-gray-300">{label}</span>
      <input
        data-testid={testid}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-64 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm"
      />
    </label>
  );
}

function CheckRow({
  label,
  hint,
  testid,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  testid: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        data-testid={testid}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="text-gray-300">
        {label}
        {hint ? <span className="ml-2 text-xs text-gray-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function GroupSection({
  name,
  title,
  description,
  children,
}: {
  name: GroupName;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`settings-group-${name}`}
      className="flex flex-col gap-3 rounded border border-gray-800 p-4"
    >
      <div>
        <h2 className="font-semibold text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function useGroupSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 返回是否成功:敏感字段成功后须清空 state(refresh 重渲染会把 state 写进 DOM value) */
  async function save(group: GroupName, values: Record<string, unknown>) {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group, values }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return false;
      }
      setSaved(true);
      router.refresh();
      return true;
    } catch {
      setError("网络异常,请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, saved, error, save };
}

function SaveBar({
  group,
  busy,
  saved,
  error,
  onSave,
}: {
  group: GroupName;
  busy: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        data-testid={`settings-save-${group}`}
        type="button"
        disabled={busy}
        onClick={onSave}
        className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? "保存中…" : "保存"}
      </button>
      {saved ? (
        <span data-testid={`settings-result-${group}`} className="text-sm text-green-400">
          已保存,即时生效
        </span>
      ) : null}
      {error ? (
        <span data-testid={`settings-result-${group}`} className="text-sm text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function SmtpGroup({ view }: { view: SettingsView["smtp"] }) {
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
        <span className="w-56 shrink-0 text-gray-300">密码</span>
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

function TurnstileGroup({ view }: { view: SettingsView["turnstile"] }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [siteKey, setSiteKey] = useState(view.siteKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="turnstile"
      title="Turnstile 人机验证"
      description="登录/注册人机校验;启用必须带双密钥,公网前请换真实密钥"
    >
      <CheckRow
        label="启用"
        hint="关闭=直通;siteKey 为公钥可回显,secretKey 只写不读"
        testid="settings-field-turnstile-enabled"
        checked={enabled}
        onChange={setEnabled}
      />
      <TextRow label="Site Key" testid="settings-field-turnstile-siteKey" value={siteKey} onChange={setSiteKey} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-gray-300">Secret Key</span>
        <SecretInput
          testid="settings-field-turnstile-secretKey"
          configured={view.secretKeyConfigured}
          value={secretKey}
          onChange={setSecretKey}
        />
      </label>
      <SaveBar
        group="turnstile"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("turnstile", { enabled, siteKey, secretKey })) setSecretKey("");
        }}
      />
    </GroupSection>
  );
}

function SecurityGroup({ view }: { view: SettingsView["security"] }) {
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

function NotifyGroup({ view }: { view: SettingsView["notify"] }) {
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

function SiteGroup({ view }: { view: SettingsView["site"] }) {
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

function DownloadGroup({ view }: { view: SettingsView["download"] }) {
  const [clientUrl, setClientUrl] = useState(view.clientUrl);
  const [clientNote, setClientNote] = useState(view.clientNote);
  const [launcherUrl, setLauncherUrl] = useState(view.launcherUrl);
  const [launcherNote, setLauncherNote] = useState(view.launcherNote);
  const [addonUrl, setAddonUrl] = useState(view.addonUrl);
  const [addonNote, setAddonNote] = useState(view.addonNote);
  const [yyNote, setYyNote] = useState(view.yyNote);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="download"
      title="下载入口"
      description="侧栏客户端/登录器/插件下载卡与 YY 频道卡;链接留空=隐藏对应卡片,可直链文件或指向教程页"
    >
      <TextRow label="客户端下载链接" testid="settings-field-download-clientUrl" value={clientUrl} onChange={setClientUrl} placeholder="/tutorial 或 https://…" />
      <TextRow label="客户端文案" testid="settings-field-download-clientNote" value={clientNote} onChange={setClientNote} />
      <TextRow label="登录器下载链接" testid="settings-field-download-launcherUrl" value={launcherUrl} onChange={setLauncherUrl} placeholder="/tutorial 或 https://…" />
      <TextRow label="登录器文案" testid="settings-field-download-launcherNote" value={launcherNote} onChange={setLauncherNote} />
      <TextRow label="插件下载链接" testid="settings-field-download-addonUrl" value={addonUrl} onChange={setAddonUrl} placeholder="/tutorial 或 https://…" />
      <TextRow label="插件文案" testid="settings-field-download-addonNote" value={addonNote} onChange={setAddonNote} />
      <TextRow label="YY 频道文案" testid="settings-field-download-yyNote" value={yyNote} onChange={setYyNote} placeholder="留空隐藏 YY 卡" />
      <SaveBar
        group="download"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() =>
          save("download", {
            clientUrl,
            clientNote,
            launcherUrl,
            launcherNote,
            addonUrl,
            addonNote,
            yyNote,
          })
        }
      />
    </GroupSection>
  );
}

function UmamiGroup({ view }: { view: SettingsView["umami"] }) {
  const [scriptUrl, setScriptUrl] = useState(view.scriptUrl ?? "");
  const [websiteId, setWebsiteId] = useState(view.websiteId ?? "");
  const [apiUrl, setApiUrl] = useState(view.apiUrl ?? "");
  const [apiUsername, setApiUsername] = useState(view.apiUsername ?? "");
  const [apiPassword, setApiPassword] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="umami"
      title="Umami 统计"
      description="流量统计采集与看板区块;scriptUrl 为浏览器侧地址,apiUrl 为服务端侧地址"
    >
      <TextRow label="采集脚本地址" testid="settings-field-umami-scriptUrl" value={scriptUrl} onChange={setScriptUrl} />
      <TextRow label="Website ID" testid="settings-field-umami-websiteId" value={websiteId} onChange={setWebsiteId} />
      <TextRow label="API 地址" testid="settings-field-umami-apiUrl" value={apiUrl} onChange={setApiUrl} />
      <TextRow label="API 用户名" testid="settings-field-umami-apiUsername" value={apiUsername} onChange={setApiUsername} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-gray-300">API 密码</span>
        <SecretInput
          testid="settings-field-umami-apiPassword"
          configured={view.apiPasswordConfigured}
          value={apiPassword}
          onChange={setApiPassword}
        />
      </label>
      <SaveBar
        group="umami"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("umami", { scriptUrl, websiteId, apiUrl, apiUsername, apiPassword }))
            setApiPassword("");
        }}
      />
    </GroupSection>
  );
}

function TestMailCard() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/settings/test-mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string | { message?: string } }
        | null;
      if (!res.ok) {
        const msg = typeof body?.error === "object" ? body?.error?.message : body?.error;
        setResult({ ok: false, text: msg ?? "请求失败" });
        return;
      }
      setResult(
        body?.ok
          ? { ok: true, text: "测试邮件已发送,请到收件箱查收" }
          : { ok: false, text: `发送失败:${body?.error ?? "未知错误"}` },
      );
    } catch {
      setResult({ ok: false, text: "网络异常,请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="settings-testmail"
      className="flex flex-col gap-3 rounded border border-gray-800 p-4"
    >
      <div>
        <h2 className="font-semibold text-gray-100">测试发信</h2>
        <p className="text-xs text-gray-500">
          用当前 SMTP 配置直发一封测试邮件(不入发信队列),保存后即时生效
        </p>
      </div>
      <TextRow label="收件地址" testid="settings-testmail-to" value={to} onChange={setTo} />
      <div className="flex items-center gap-3">
        <button
          data-testid="settings-testmail-run"
          type="button"
          disabled={busy || to === ""}
          onClick={send}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "发送中…" : "发送测试邮件"}
        </button>
        {result ? (
          <span
            data-testid="settings-testmail-result"
            className={`text-sm ${result.ok ? "text-green-400" : "text-red-400"}`}
          >
            {result.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsForms({ view }: { view: SettingsView }) {
  return (
    <div className="flex flex-col gap-4">
      <SmtpGroup view={view.smtp} />
      <TurnstileGroup view={view.turnstile} />
      <SecurityGroup view={view.security} />
      <NotifyGroup view={view.notify} />
      <SiteGroup view={view.site} />
      <DownloadGroup view={view.download} />
      <UmamiGroup view={view.umami} />
      <TestMailCard />
    </div>
  );
}
