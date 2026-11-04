"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckChip } from "@/components/ui/check-chip";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

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
      await requestJson(
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
      router.push("/admin/articles");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <Card>
        <CardHeader title="基础信息" />
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[#93b2ce]">标题</span>
              <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#93b2ce]">别名 slug(留空=按标题自动生成)</span>
              <Input value={values.slug} onChange={(e) => set("slug", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[#93b2ce]">分类</span>
              <Select value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)} className="w-auto">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[#93b2ce]">摘要(留空=列表截取正文)</span>
              <Textarea value={values.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={1} />
            </label>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[#93b2ce]">标签(可多选)</span>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <CheckChip
                    key={t.id}
                    checked={values.tagIds.includes(t.id)}
                    onChange={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </CheckChip>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="正文(Markdown,支持粘贴图片直接上传)" />
        <CardBody>
          <MarkdownEditor value={values.bodyMd} onChange={(v) => set("bodyMd", v)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              发布
              <Badge tone={values.status === "published" ? "ok" : "muted"}>
                {values.status === "published" ? "已发布" : "草稿"}
              </Badge>
            </span>
          }
          actions={
            <Button type="button" variant="primary" onClick={submit} disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
          }
        />
        <CardBody className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[#93b2ce]">状态</span>
            <Select value={values.status} onChange={(e) => set("status", e.target.value)} className="w-auto">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
            </Select>
            <span className="text-xs text-[#6482a3]">首次发布将记录发布时间</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-[#eda9a9]">
              {error}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
