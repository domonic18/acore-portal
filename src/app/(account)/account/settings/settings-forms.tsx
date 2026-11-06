"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";

function EmailTokenConfirmer() {
  const searchParams = useSearchParams();
  const token = searchParams.get("email_token");
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await requestJson("/api/account/confirm-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setStatus("ok");
      } catch {
        setStatus("fail");
      }
    })();
  }, [token]);

  if (!token) return null;
  return (
    <p role="status" className="text-sm">
      {status === "ok"
        ? "新邮箱绑定成功。"
        : status === "fail"
          ? "邮箱确认失败:链接无效、已过期或邮箱被占用,请重新发起换绑。"
          : "正在确认新邮箱…"}
    </p>
  );
}

function NicknameForm({ initial }: { initial: string }) {
  const [nickname, setNickname] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const body = await requestJson<{ user?: { nickname?: string } }>("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      setMessage(`昵称已更新为「${body.user?.nickname ?? nickname}」。`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">昵称</h2>
      <label className="flex flex-col gap-1 text-sm">
        昵称(2-64 个字符)
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          minLength={2}
          maxLength={64}
          placeholder="未设置"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-400">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-page hover:bg-link disabled:opacity-50"
      >
        {submitting ? "保存中…" : "保存昵称"}
      </button>
    </form>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await requestJson("/api/account/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      setMessage("密码已更新,请使用新密码重新登录。");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">修改密码</h2>
      <label className="flex flex-col gap-1 text-sm">
        当前密码
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        新密码(至少 8 位,含字母和数字)
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-400">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-page hover:bg-link disabled:opacity-50"
      >
        {submitting ? "提交中…" : "修改密码"}
      </button>
    </form>
  );
}

function ChangeEmailForm() {
  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const body = await requestJson<{ message?: string }>("/api/account/change-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_email: newEmail, current_password: current }),
      });
      setMessage(body.message ?? "确认邮件已发送。");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">更换邮箱</h2>
      <label className="flex flex-col gap-1 text-sm">
        新邮箱
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        当前密码
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="rounded-md border border-line bg-panel-inset px-3 py-2 text-heading focus:border-accent focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-400">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-page hover:bg-link disabled:opacity-50"
      >
        {submitting ? "提交中…" : "发送确认邮件"}
      </button>
    </form>
  );
}

/** 设置页交互面(昵称/密码/邮箱);页面壳在 server 侧负责数据注入与 Suspense */
export function SettingsForms({
  username,
  email,
  nickname,
}: {
  username: string;
  email: string;
  nickname: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <EmailTokenConfirmer />
      </Suspense>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="text-lg font-semibold">账号资料</h2>
        <span className="text-body">用户名:{username}(不可修改)</span>
        <span className="text-body">当前邮箱:{email}</span>
      </section>
      <NicknameForm initial={nickname} />
      <ChangePasswordForm />
      <ChangeEmailForm />
    </div>
  );
}
