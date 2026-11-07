"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { HOME_ACHIEVEMENT_HEIGHT } from "@/constants/home";

/**
 * 最近成就嵌入配置(form api-admin 契约):PUT /api/admin/settings group=home,
 * url 空=首页整块隐藏;保存即 reloadSystemConfig 热生效。
 */
export function AchievementEmbedForm({
  initial,
  rankBase,
}: {
  initial: { achievementUrl: string; achievementHeight: string; achievementScrolling: boolean };
  /** 占位示例取自 tools.rankBase 运行时配置,不在组件内写死外部域 */
  rankBase: string;
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
      await requestJson("/api/admin/settings", {
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
      <h2 className="text-lg font-semibold text-[#dcebf7]">最近成就嵌入</h2>
      <p className="text-xs text-[#6482a3]">
        首页以 iframe 嵌入外部成就页(如 rank 站);页面地址留空则首页隐藏该区块。
        桌面端该区块与首页右栏等高(不低于此处设定的最小高度);设定值本身封顶 {HOME_ACHIEVEMENT_HEIGHT}。
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
          页面地址
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`${rankBase.replace(/\/+$/, "")}/achievement`}
            className="w-96 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
          显示高度
          <Input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            placeholder={HOME_ACHIEVEMENT_HEIGHT}
            className="w-24 py-1"
          />
        </label>
        <label className="flex items-center gap-2 pb-1 text-xs text-[#93b2ce]">
          显示滚动条
          <Switch
            checked={scrolling}
            disabled={!hydrated}
            onChange={setScrolling}
            ariaLabel="显示滚动条"
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
