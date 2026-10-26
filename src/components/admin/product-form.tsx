"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { ProductImagesEditor } from "@/components/admin/product-images-editor";

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
  gameItemId?: number | null;
  status: string;
  listed: boolean;
};

const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

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
      const res = await fetch("/api/admin/products", {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "保存失败,请稍后重试。");
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const isGame = values.type === "game_item";

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">类型</span>
        <select value={values.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
          <option value="game_item">物品类</option>
          <option value="service">服务类</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">SKU({isGame ? "itemsend_{物品ID}" : "处理器键,如 char-change-race"})</span>
        <input value={values.sku} onChange={(e) => set("sku", e.target.value)} className={inputCls} />
      </label>
      {isGame && (
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">游戏物品 ID(world.item_template entry)</span>
          <input
            type="number"
            value={values.gameItemId ?? ""}
            onChange={(e) => set("gameItemId", e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">名称</span>
        <input value={values.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">别名 slug(小写字母/数字/连字符)</span>
        <input value={values.slug} onChange={(e) => set("slug", e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">分类</span>
        <select
          value={values.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          className={inputCls}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-gray-300">描述</span>
        <textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className={inputCls}
        />
      </label>
      <ProductImagesEditor images={values.images} onChange={(v) => set("images", v)} />
      <div className="flex flex-col gap-1">
        <span className="text-gray-300">详情(Markdown,支持粘贴/选择图片;留空=详情页显示描述)</span>
        <MarkdownEditor value={values.detailMd} onChange={(v) => set("detailMd", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">原价(积分)</span>
          <input
            type="number"
            min={0}
            value={values.price}
            onChange={(e) => set("price", Number(e.target.value) || 0)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">促销价(留空=无促销)</span>
          <input
            type="number"
            min={0}
            value={values.salePrice ?? ""}
            onChange={(e) =>
              set("salePrice", e.target.value === "" ? null : Number(e.target.value) || 0)
            }
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.stockEnabled}
            onChange={(e) => set("stockEnabled", e.target.checked)}
          />
          <span className="text-gray-300">启用库存管理</span>
        </label>
        {values.stockEnabled && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-gray-300">库存</span>
              <input
                type="number"
                min={0}
                value={values.stock ?? 0}
                onChange={(e) => set("stock", Number(e.target.value) || 0)}
                className={`${inputCls} w-24`}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-gray-300">低库存阈值</span>
              <input
                type="number"
                min={0}
                value={values.lowStockThreshold ?? 1}
                onChange={(e) => set("lowStockThreshold", Number(e.target.value) || 0)}
                className={`${inputCls} w-20`}
              />
            </label>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-300">状态</span>
          <select
            value={values.status}
            onChange={(e) => set("status", e.target.value)}
            className={inputCls}
          >
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end">
          <input
            type="checkbox"
            checked={values.listed}
            onChange={(e) => set("listed", e.target.checked)}
          />
          <span className="text-gray-300">目录可见(listed)</span>
        </label>
      </div>
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
