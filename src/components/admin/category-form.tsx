"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 分类新建行(api-admin POST /api/admin/categories):slug 唯一冲突 409 原样呈现。
 * 可指定上级分类(前台分面树按父子聚合展示,层级在建分类时就定好)。
 */
export function CategoryForm({
  parentOptions,
}: {
  parentOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sort, setSort] = useState("0");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestJson("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          sort: Number(sort) || 0,
          parentId: parentId ? Number(parentId) : null,
        }),
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto sm:min-w-[200px]">
          <span className="text-[#93b2ce]">名称</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-auto sm:min-w-[200px]">
          <span className="text-[#93b2ce]">slug</span>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">排序</span>
          <Input
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">上级分类</span>
          <Select
            aria-label="上级分类"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-auto min-w-[160px]"
          >
            <option value="">顶级分类(无上级)</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <Button
          type="button"
          variant="primary"
          onClick={submit}
          disabled={busy || !name || !slug}
        >
          {busy ? "保存中…" : "新增分类"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </div>
  );
}
