"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ContentPanel } from "@/components/site/content-panel";

function ResendForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/resend-activation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok || res.status === 429) setSent(true);
    } catch {
      // 恒定文案,不区分失败细节
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <p className="text-sm text-[#93b2ce]" role="status">
        若该邮箱可重发,激活邮件将很快送达,请查收(含垃圾箱)。
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-[#93b2ce]" role="alert">
        链接无效或已过期。请重新注册,或在下方输入注册邮箱重发激活邮件。
      </p>
      <label className="flex flex-col gap-1 text-sm">
        注册邮箱
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-[#5ea3cc] px-4 py-2 text-sm font-medium text-[#0a1220] hover:bg-[#6fb7e0] disabled:opacity-50"
      >
        {submitting ? "提交中…" : "重发激活邮件"}
      </button>
    </form>
  );
}

function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("两次输入的密码不一致。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        // 激活即登录:Cookie 已由端点下发
        window.location.href = "/account/overview";
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      if (body?.error?.code === "TOKEN_INVALID_OR_EXPIRED") {
        setExpired(true);
        return;
      }
      setError(body?.error?.message ?? "设置失败,请稍后再试。");
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || expired) {
    return <ResendForm />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-[#93b2ce]">
        设置密码完成激活。用户名即游戏账号,两端同密。
      </p>
      <label className="flex flex-col gap-1 text-sm">
        密码(至少 8 位,含字母和数字)
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        确认密码
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-[#22385a] bg-[#0d1828] px-3 py-2 text-[#dcebf7] focus:border-[#5ea3cc] focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[#5ea3cc] px-4 py-2 font-medium text-[#0a1220] hover:bg-[#6fb7e0] disabled:opacity-50"
      >
        {submitting ? "提交中…" : "设置密码并激活"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 lg:p-8">
      <ContentPanel className="w-full max-w-md p-7 lg:p-8">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-2xl font-bold text-[#dcebf7]">设置密码</h1>
          <Suspense fallback={null}>
            <SetPasswordForm />
          </Suspense>
        </div>
      </ContentPanel>
    </main>
  );
}
