"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 最近成就嵌入配置(form api-admin 契约):PUT /api/admin/settings group=home,
 * url 空=首页整块隐藏;保存即 reloadSystemConfig 热生效。
 */
export function AchievementEmbedForm({
  initial,
}: {
  initial: { achievementUrl: string; achievementHeight: string; achievementScrolling: boolean };
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [url, setUrl] = useState(initial.achievementUrl);
  const [height, setHeight] = useState(initial.achievementHeight);
  const [scrolling, setScrolling] = useState(initial.achievementScrolling);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setOk(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          group: "home",
          values: {
            achievementUrl: url.trim(),
            achievementHeight: height.trim(),
            achievementScrolling: scrolling,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return;
      }
      setOk(true);
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">最近成就嵌入</h2>
      <p className="text-xs text-gray-400">
        首页以 iframe 嵌入外部成就页(如 rank 站);页面地址留空则首页隐藏该区块。
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          页面地址
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://rank.lokta.cn/achievement"
            className={`${inputCls} w-96`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          显示高度
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder="185vh"
            className={`${inputCls} w-24`}
          />
        </label>
        <label className="flex items-center gap-1 pb-1 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={scrolling}
            disabled={!hydrated}
            onChange={(e) => setScrolling(e.target.checked)}
          />
          显示滚动条
        </label>
        <button
          type="submit"
          disabled={busy || !hydrated}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          保存
        </button>
      </form>
      {ok && <p className="text-xs text-green-400">已保存,首页即时生效。</p>}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
