"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ContentPanel } from "@/components/site/content-panel";
import { errorMessage, requestJson } from "@/lib/api-client";

function ResetForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
      await requestJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-[#93b2ce]" role="alert">
        链接缺少凭证,请从邮件中重新打开,或{" "}
        <a href="/forgot-password" className="text-[#6fb7e0] hover:underline">
          重新申请找回
        </a>
        。
      </p>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p role="status">密码已重置,请使用新密码登录。所有旧登录已失效。</p>
        <a
          href="/login"
          className="rounded-md bg-[#5ea3cc] px-4 py-2 text-center font-medium text-[#0a1220] hover:bg-[#6fb7e0]"
        >
          去登录
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        新密码(至少 8 位,含字母和数字)
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
        确认新密码
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
        {submitting ? "提交中…" : "设置新密码"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 lg:p-8">
      <ContentPanel className="w-full max-w-md p-7 lg:p-8">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-2xl font-bold text-[#dcebf7]">设置新密码</h1>
          <Suspense fallback={null}>
            <ResetForm />
          </Suspense>
        </div>
      </ContentPanel>
    </main>
  );
}
