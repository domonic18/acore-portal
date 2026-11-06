"use client";

import { useState } from "react";
import { ContentPanel } from "@/components/site/content-panel";
import { ApiRequestError, errorMessage, requestJson } from "@/lib/api-client";

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
      await requestJson("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      // 429 为限速,同样按受理成功处理(不泄露邮箱是否存在)
      if (err instanceof ApiRequestError && err.status === 429) {
        setSent(true);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6 lg:p-8">
      <ContentPanel className="w-full max-w-md p-7 lg:p-8">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-2xl font-bold text-heading">找回密码</h1>
          {sent ? (
            <p className="text-sm text-body" role="status">
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
                  className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
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
                className="rounded-md bg-accent px-4 py-2 font-medium text-page hover:bg-link disabled:opacity-50"
              >
                {submitting ? "提交中…" : "发送重置邮件"}
              </button>
              <a href="/login" className="text-sm text-muted hover:text-link">
                返回登录
              </a>
            </form>
          )}
        </div>
      </ContentPanel>
    </main>
  );
}
