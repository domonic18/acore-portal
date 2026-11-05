"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/** 静态页表单(T032,FR-216):slug 保留字/冲突错误由服务端 422 原样呈现 */
export type PageFormValues = {
  id?: string;
  slug: string;
  title: string;
  bodyMd: string;
  status: string;
  sortOrder: number;
  /** 页面级目录开关:null=跟随全局设置(系统设置→内容展示) */
  tocEnabled: boolean | null;
};

/** 目录开关三态 select 值 ↔ nullable boolean */
const TOC_OPTIONS = [
  { value: "", label: "跟随全局设置" },
  { value: "on", label: "显示目录" },
  { value: "off", label: "关闭目录" },
] as const;

function tocToValue(v: boolean | null): string {
  if (v === null) return "";
  return v ? "on" : "off";
}

function valueToToc(v: string): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

export function PageForm({ initial }: { initial?: PageFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<PageFormValues>(
    initial ?? { slug: "", title: "", bodyMd: "", status: "draft", sortOrder: 0, tocEnabled: null },
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
      await requestJson(initial?.id ? `/api/admin/pages/${initial.id}` : "/api/admin/pages", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      router.push("/admin/pages");
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
        <CardBody className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[#93b2ce]">标题</span>
            <Input value={values.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[#93b2ce]">别名 slug(根级 /{"{slug}"} 路由;系统保留字会被拒绝)</span>
            <Input value={values.slug} onChange={(e) => set("slug", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[#93b2ce]">排序(网站地图用)</span>
            <Input
              type="number"
              min={0}
              value={values.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
            />
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="正文(Markdown)" />
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
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[#93b2ce]">左侧目录</span>
            <Select
              value={tocToValue(values.tocEnabled)}
              onChange={(e) => set("tocEnabled", valueToToc(e.target.value))}
              className="w-auto"
            >
              {TOC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
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
