"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** 看板手动刷新(T027/R12):router.refresh 重跑 RSC,不引入轮询 */
export function StatsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  return (
    <button
      type="button"
      data-testid="stats-refresh"
      disabled={pending}
      onClick={() => {
        setClicked(true);
        startTransition(() => router.refresh());
      }}
      className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-40"
    >
      {pending ? "刷新中…" : clicked ? "再刷新一次" : "手动刷新"}
    </button>
  );
}
