"use client";

import { useState } from "react";
import TurnstileWidget from "@/components/auth/TurnstileWidget";
import { errorMessage, requestJson } from "@/lib/api-client";

/** 注册页无密码输入(FR-005):激活链接设密 */
export default function RegisterForm({
  turnstileEnabled,
  turnstileSiteKey,
}: {
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (turnstileEnabled && !turnstileToken) {
        setError("请先完成人机验证。");
        return;
      }
      await requestJson("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, turnstileToken }),
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold text-[#dcebf7]">注册账号</h1>
      {sent ? (
        <p className="text-sm text-[#93b2ce]" role="status">
          注册受理成功,激活邮件已发送至 {email},请查收(含垃圾箱)。邮件 24
          小时内有效,点击链接设置密码。
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-xs text-[#6482a3]">
            用户名即游戏账号名,注册后用于登录站点与游戏。
          </p>
          <label className="flex flex-col gap-1 text-sm">
            用户名
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              maxLength={32}
              autoComplete="username"
              className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
            />
          </label>
          {turnstileEnabled && (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onToken={setTurnstileToken}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || (turnstileEnabled && !turnstileToken)}
            className="rounded-md bg-[#5ea3cc] px-4 py-2 font-medium text-[#0a1220] hover:bg-[#6fb7e0] disabled:opacity-50"
          >
            {submitting ? "提交中…" : "发送激活邮件"}
          </button>
          <a href="/login" className="text-sm text-[#6482a3] hover:text-[#6fb7e0]">
            已有账号?去登录
          </a>
        </form>
      )}
    </div>
  );
}
