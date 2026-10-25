"use client";

import { useState } from "react";
import TurnstileWidget from "@/components/auth/TurnstileWidget";

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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, turnstileToken }),
      });
      if (res.status === 202) {
        setSent(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "提交失败,请稍后再试。");
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">注册账号</h1>
      {sent ? (
        <p className="text-sm text-gray-300" role="status">
          注册受理成功,激活邮件已发送至 {email},请查收(含垃圾箱)。邮件 24
          小时内有效,点击链接设置密码。
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
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
              className="rounded border border-gray-600 bg-transparent px-3 py-2"
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
              className="rounded border border-gray-600 bg-transparent px-3 py-2"
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
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "提交中…" : "发送激活邮件"}
          </button>
          <a href="/login" className="text-sm text-gray-400 hover:text-gray-200">
            已有账号?去登录
          </a>
        </form>
      )}
    </div>
  );
}
