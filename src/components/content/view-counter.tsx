"use client";

import { useEffect } from "react";

/** 阅读计数上报(R2):水合后 POST 一次,失败静默(计数非关键路径) */
export function ViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`/api/content/article/${encodeURIComponent(slug)}/view`, {
      method: "POST",
    }).catch(() => undefined);
  }, [slug]);
  return null;
}
