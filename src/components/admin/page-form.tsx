"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/admin/markdown-editor";

/** 静态页表单(T032,FR-216):slug 保留字/冲突错误由服务端 422 原样呈现 */
export type PageFormValues = {
  id?: string;
  slug: string;
  title: string;
  bodyMd: string;
  status: string;
  sortOrder: number;
};

const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

export function PageForm({ initial }: { initial?: PageFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<PageFormValues>(
    initial ?? { slug: "", title: "", bodyMd: "", status: "draft", sortOrder: 0 },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PageFormValues>(key: K, v: PageFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        initial?.id ? `/api/admin/pages/${initial.id}` : "/api/admin/pages",
        {
          method: initial?.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return;
      }
      router.push("/admin/pages");
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">标题</span>
          <input value={values.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">别名 slug(根级 /{"{slug}"} 路由;系统保留字会被拒绝)</span>
          <input value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">排序(网站地图用)</span>
          <input
            type="number"
            min={0}
            value={values.sortOrder}
            onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-gray-300">正文(Markdown)</span>
        <MarkdownEditor value={values.bodyMd} onChange={(v) => set("bodyMd", v)} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">状态</span>
        <select value={values.status} onChange={(e) => set("status", e.target.value)} className={`${inputCls} w-fit`}>
          <option value="draft">草稿</option>
          <option value="published">发布</option>
        </select>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-fit rounded bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? "保存中…" : "保存"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
