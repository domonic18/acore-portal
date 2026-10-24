"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/admin/markdown-editor";

/**
 * 文章新建/编辑表单(T032,FR-215):分类/标签(多选)选择,正文走
 * MarkdownEditor;slug 留空=服务端按标题自动生成;422/404 错误原样呈现。
 */
export type ArticleFormValues = {
  id?: string;
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  bodyMd: string;
  status: string;
  tagIds: string[];
};

const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

export function ArticleForm({
  initial,
  categories,
  tags,
}: {
  initial?: ArticleFormValues;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ArticleFormValues>(
    initial ?? {
      title: "",
      slug: "",
      categoryId: categories[0]?.id ?? "",
      excerpt: "",
      bodyMd: "",
      status: "draft",
      tagIds: [],
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ArticleFormValues>(key: K, v: ArticleFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function toggleTag(id: string) {
    setValues((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(id)
        ? prev.tagIds.filter((t) => t !== id)
        : [...prev.tagIds, id],
    }));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        initial?.id ? `/api/admin/articles/${initial.id}` : "/api/admin/articles",
        {
          method: initial?.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: values.title,
            slug: values.slug || undefined,
            categoryId: values.categoryId,
            excerpt: values.excerpt || null,
            bodyMd: values.bodyMd,
            status: values.status,
            tagIds: values.tagIds.map(Number),
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return;
      }
      router.push("/admin/articles");
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">标题</span>
          <input value={values.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">别名 slug(留空=按标题自动生成)</span>
          <input value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">分类</span>
        <select value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-gray-300">标签(可多选)</span>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1">
                <input
                  type="checkbox"
                  checked={values.tagIds.includes(t.id)}
                  onChange={() => toggleTag(t.id)}
                />
                <span className="text-gray-300">{t.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">摘要(留空=列表截取正文)</span>
        <textarea value={values.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={2} className={inputCls} />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-gray-300">正文(Markdown,支持粘贴图片直接上传)</span>
        <MarkdownEditor value={values.bodyMd} onChange={(v) => set("bodyMd", v)} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">状态</span>
        <select value={values.status} onChange={(e) => set("status", e.target.value)} className={`${inputCls} w-fit`}>
          <option value="draft">草稿</option>
          <option value="published">发布(draft→published 记录首发时间)</option>
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
