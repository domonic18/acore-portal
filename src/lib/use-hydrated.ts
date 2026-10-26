"use client";

import { useEffect, useState } from "react";

/** hydration 完成前返回 false:纯 JS 交互控件(无表单回退)以此禁用,避免水合前丢事件 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
