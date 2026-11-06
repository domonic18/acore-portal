"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import CaptchaWidget from "@/components/auth/captcha-widget";
import { errorMessage, requestJson } from "@/lib/api-client";
import { safeNextPath } from "@/lib/safe-redirect";

export default function LoginForm({
  captchaEnabled,
  captchaAppId,
}: {
  captchaEnabled: boolean;
  captchaAppId: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [captcha, setCaptcha] = useState({ ticket: "", randstr: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (captchaEnabled && !captcha.ticket) {
        setError("请先完成人机验证。");
        return;
      }
      await requestJson("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          remember,
          captchaTicket: captcha.ticket,
          captchaRandstr: captcha.randstr,
        }),
      });
      window.location.href = safeNextPath(searchParams.get("next"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold text-heading">登录</h1>
      <label className="flex flex-col gap-1 text-sm">
        用户名
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={32}
          autoComplete="username"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密码
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={256}
          autoComplete="current-password"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        记住登录(30 天)
      </label>
      {captchaEnabled && (
        <CaptchaWidget
          appId={captchaAppId}
          onVerify={(ticket, randstr) => setCaptcha({ ticket, randstr })}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || (captchaEnabled && !captcha.ticket)}
        className="rounded-md bg-accent px-4 py-2 font-medium text-page hover:bg-link disabled:opacity-50"
      >
        {submitting ? "登录中…" : "登录"}
      </button>
      <div className="flex justify-between text-sm text-muted">
        <a href="/forgot-password" className="hover:text-link">
          忘记密码?
        </a>
        <a href="/register" className="hover:text-link">
          没有账号?注册
        </a>
      </div>
    </form>
  );
}
