"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ProductImagesEditor } from "@/components/admin/product-images-editor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input, Select, Textarea } from "@/components/ui/input";

/**
 * 商品新建/编辑表单(api-admin POST·PATCH /api/admin/products):
 * SKU 保存校验在服务端(FR-126),422/409/503 错误原样呈现;成功回列表页;
 * 图片走媒体库编辑器,详情正文走 MarkdownEditor(WP 对齐)。
 */
export type ProductFormValues = {
  id?: string;
  type: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  detailMd: string;
  categoryId: string;
  price: number;
  salePrice?: number | null;
  saleStart?: string | null;
  saleEnd?: string | null;
  stockEnabled: boolean;
  stock?: number | null;
  lowStockThreshold?: number | null;
  maxPerUser?: number | null;
  gameItemId?: number | null;
  status: string;
  listed: boolean;
};

export function ProductForm({
  initial,
  categories,
}: {
  initial?: ProductFormValues;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(
    initial ?? {
      type: "game_item",
      sku: "",
      name: "",
      slug: "",
      description: "",
      images: [],
      detailMd: "",
      categoryId: categories[0]?.id ?? "",
      price: 0,
      stockEnabled: false,
      status: "draft",
      listed: true,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ProductFormValues>(key: K, v: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await requestJson("/api/admin/products", {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isGame = values.type === "game_item";

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">类型</span>
        <Select value={values.type} onChange={(e) => set("type", e.target.value)} className="w-auto">
          <option value="game_item">物品类</option>
          <option value="service">服务类</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">SKU({isGame ? "itemsend_{物品ID}" : "处理器键,如 char-change-race"})</span>
        <Input value={values.sku} onChange={(e) => set("sku", e.target.value)} />
      </label>
      {isGame && (
        <label className="flex flex-col gap-1">
          <span className="text-[#93b2ce]">游戏物品 ID(world.item_template entry)</span>
          <Input
            type="number"
            value={values.gameItemId ?? ""}
            onChange={(e) => set("gameItemId", e.target.value === "" ? null : Number(e.target.value))}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">名称</span>
        <Input value={values.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">别名 slug(小写字母/数字/连字符)</span>
        <Input value={values.slug} onChange={(e) => set("slug", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">分类</span>
        <Select
          value={values.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          className="w-auto"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">描述</span>
        <Textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
        />
      </label>
      <ProductImagesEditor images={values.images} onChange={(v) => set("images", v)} />
      <div className="flex flex-col gap-1">
        <span className="text-[#93b2ce]">详情(Markdown,支持粘贴/选择图片;留空=详情页显示描述)</span>
        <MarkdownEditor value={values.detailMd} onChange={(v) => set("detailMd", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[#93b2ce]">原价(积分)</span>
          <Input
            type="number"
            min={0}
            value={values.price}
            onChange={(e) => set("price", Number(e.target.value) || 0)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[#93b2ce]">促销价(留空=无促销)</span>
          <Input
            type="number"
            min={0}
            value={values.salePrice ?? ""}
            onChange={(e) =>
              set("salePrice", e.target.value === "" ? null : Number(e.target.value) || 0)
            }
          />
        </label>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2">
          <Switch
            checked={values.stockEnabled}
            onChange={(v) => set("stockEnabled", v)}
            ariaLabel="启用库存管理"
          />
          <span className="text-[#93b2ce]">启用库存管理</span>
        </label>
        {values.stockEnabled && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-[#93b2ce]">库存</span>
              <Input
                type="number"
                min={0}
                value={values.stock ?? 0}
                onChange={(e) => set("stock", Number(e.target.value) || 0)}
                className="w-24"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[#93b2ce]">低库存阈值</span>
              <Input
                type="number"
                min={0}
                value={values.lowStockThreshold ?? 1}
                onChange={(e) => set("lowStockThreshold", Number(e.target.value) || 0)}
                className="w-20"
              />
            </label>
          </>
        )}
      </div>
      <label className="flex items-center gap-2">
        <span className="text-[#93b2ce]">每人限购(留空=不限购)</span>
        <Input
          type="number"
          min={1}
          value={values.maxPerUser ?? ""}
          onChange={(e) =>
            set(
              "maxPerUser",
              e.target.value === ""
                ? null
                : Math.max(1, Math.floor(Number(e.target.value) || 1)),
            )
          }
          className="w-24"
        />
        <span className="text-xs text-[#6482a3]">
          按用户累计已购件数(不含已取消/退款单)
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[#93b2ce]">状态</span>
          <Select
            value={values.status}
            onChange={(e) => set("status", e.target.value)}
            className="w-auto"
          >
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 self-end">
          <Switch
            checked={values.listed}
            onChange={(v) => set("listed", v)}
            ariaLabel="目录可见"
          />
          <span className="text-[#93b2ce]">目录可见(listed)</span>
        </label>
      </div>
      <Button type="button" variant="primary" onClick={submit} disabled={busy} className="w-fit px-6 py-2 text-sm">
        {busy ? "保存中…" : "保存"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </div>
  );
}
