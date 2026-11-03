"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/** 看板手动刷新(T027/R12):router.refresh 重跑 RSC,不引入轮询 */
export function StatsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      data-testid="stats-refresh"
      disabled={pending}
      onClick={() => {
        setClicked(true);
        startTransition(() => router.refresh());
      }}
    >
      {pending ? "刷新中…" : clicked ? "再刷新一次" : "手动刷新"}
    </Button>
  );
}
