"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      await requestJson("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          group: "home",
          values: { carouselIntervalSec: sec.trim() },
        }),
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-[#dcebf7]">轮播设置</h2>
      <p className="text-xs text-[#6482a3]">
        首页轮播自动切换间隔(1-60 秒);物料仅一张时不轮播。
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
          轮播间隔(秒)
          <Input
            type="number"
            value={sec}
            onChange={(e) => setSec(e.target.value)}
            className="w-24 py-1"
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !hydrated}>
          保存
        </Button>
      </form>
      {ok && <p className="text-xs text-[#6ee7b7]">已保存,首页即时生效。</p>}
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </section>
  );
}
