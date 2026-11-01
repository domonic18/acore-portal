"use client";

import { useState } from "react";
import { ContentPanel } from "@/components/site/content-panel";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok || res.status === 429) {
        setSent(true);
        return;
      }
      setError("提交失败,请稍后再试。");
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 lg:p-8">
      <ContentPanel className="w-full max-w-md p-7 lg:p-8">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-2xl font-bold text-[#dcebf7]">找回密码</h1>
          {sent ? (
            <p className="text-sm text-[#93b2ce]" role="status">
              若该邮箱已注册,重置邮件将很快送达,请查收(含垃圾箱)。链接 30
              分钟内有效。
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                {submitting ? "提交中…" : "发送重置邮件"}
              </button>
              <a href="/login" className="text-sm text-[#6482a3] hover:text-[#6fb7e0]">
                返回登录
              </a>
            </form>
          )}
        </div>
      </ContentPanel>
    </main>
  );
}
