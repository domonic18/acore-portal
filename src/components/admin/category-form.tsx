"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 分类新建行(api-admin POST /api/admin/categories):slug 唯一冲突 409 原样呈现。
 */
export function CategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sort, setSort] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug, sort: Number(sort) || 0 }),
      });
      setName("");
      setSlug("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">排序</span>
          <input
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name || !slug}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "保存中…" : "新增分类"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
