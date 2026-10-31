"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 轮播设置(form api-admin 契约):PUT /api/admin/settings group=home 只带
 * carouselIntervalSec(1-60 秒);其余 home 字段缺省=服务端保持现值,
 * 与成就嵌入表单互不覆写。保存即 reloadSystemConfig 热生效。
 */
export function CarouselSettingsForm({ initial }: { initial: { carouselIntervalSec: number } }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [sec, setSec] = useState(String(initial.carouselIntervalSec));
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
          values: { carouselIntervalSec: sec.trim() },
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

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">轮播设置</h2>
      <p className="text-xs text-gray-400">
        首页轮播自动切换间隔(1-60 秒);物料仅一张时不轮播。
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          轮播间隔(秒)
          <input
            type="number"
            value={sec}
            onChange={(e) => setSec(e.target.value)}
            className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
          />
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
