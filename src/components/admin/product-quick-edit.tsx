"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProductStatusActions } from "@/components/admin/product-status-actions";
import { ProductRowCheckbox } from "@/components/admin/product-selection";
import { requestJson, errorMessage } from "@/lib/api-client";

export type QuickEditProduct = {
  id: string;
  sku: string;
  name: string;
  type: string;
  image: string | null;
  status: string;
  listed: boolean;
  featured: boolean;
  price: number;
  salePrice: number | null;
  stockEnabled: boolean;
  stock: number | null;
  lowStock: boolean;
  categoryName: string;
};

type Draft = {
  price: string;
  salePrice: string;
  stockEnabled: boolean;
  stock: string;
  status: string;
  listed: boolean;
  featured: boolean;
};

function toDraft(p: QuickEditProduct): Draft {
  return {
    price: String(p.price),
    salePrice: p.salePrice == null ? "" : String(p.salePrice),
    stockEnabled: p.stockEnabled,
    stock: p.stock == null ? "0" : String(p.stock),
    status: p.status,
    listed: p.listed,
    featured: p.featured,
  };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11.5px] text-[#6482a3]">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[#6482a3]/80">{hint}</span>}
    </label>
  );
}

/**
 * 商品列表行 + 快速编辑展开行(用户反馈 2026-11-03,对标 WP 快速编辑):
 * 行内展开高频字段(原价/促销价/库存/状态/目录显隐/首页精选),回车保存/Esc 取消;
 * 主行 DOM 保持语义 table 结构,E2E 依赖 row/name 断言不受影响。
 */
export function ProductQuickEditRow({ product }: { product: QuickEditProduct }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setDraft(toDraft(product));
    setError("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setDraft(null);
    setError("");
  };

  const save = async () => {
    if (!draft) return;
    const price = Number(draft.price);
    if (!Number.isInteger(price) || price <= 0) {
      setError("原价必须为正整数。");
      return;
    }
    const salePrice = draft.salePrice === "" ? null : Number(draft.salePrice);
    if (salePrice != null && (!Number.isInteger(salePrice) || salePrice < 0)) {
      setError("促销价必须为非负整数。");
      return;
    }
    if (salePrice != null && salePrice >= price) {
      setError("促销价必须低于原价。");
      return;
    }
    const stock = draft.stock === "" ? null : Number(draft.stock);
    if (stock != null && (!Number.isInteger(stock) || stock < 0)) {
      setError("库存必须为非负整数。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/admin/products/${product.id}/quick-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price,
          salePrice,
          stockEnabled: draft.stockEnabled,
          stock: draft.stockEnabled ? stock : null,
          status: draft.status,
          listed: draft.listed,
          featured: draft.featured,
        }),
      });
      setOpen(false);
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const isService = product.type !== "game_item";

  return (
    <>
      <tr
        className={`border-b border-[#22385a]/40 transition last:border-b-0 hover:bg-[#16283f] ${
          product.lowStock ? "bg-[#e8c877]/5" : ""
        }`}
      >
        <td className="px-3 py-2.5">
          <ProductRowCheckbox id={product.id} />
        </td>
        <td className="px-3 py-2.5">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-9 w-9 rounded border border-[#22385a] object-contain"
            />
          ) : (
            <span aria-hidden className="text-lg text-[#6482a3]">
              {product.type === "game_item" ? "⚔" : "🛠"}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <Link
            href={`/admin/products/${product.id}`}
            className="rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
          >
            {product.name}
          </Link>
          {product.featured && (
            <Badge tone="accent" className="ml-2">
              精选
            </Badge>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-[#6482a3]">{product.sku}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[#93b2ce]">{product.categoryName}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[#e8c877]">{product.price}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {product.stockEnabled ? (
            <span className={product.lowStock ? "font-semibold text-[#e8c877]" : "text-[#c4d9ec]"}>
              {product.stock}
              {product.lowStock && " (低库存)"}
            </span>
          ) : (
            <span className="text-[#6482a3]">不限</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <Badge tone={product.status === "published" ? "ok" : "muted"}>
            {product.status === "published" ? "已发布" : "草稿"}
          </Badge>
          {!product.listed && (
            <Badge tone="muted" className="ml-1">
              目录隐藏
            </Badge>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={startEdit} aria-expanded={open}>
              快速编辑
            </Button>
            <ProductStatusActions
              productId={product.id}
              status={product.status}
              listed={product.listed}
              type={product.type}
            />
          </div>
        </td>
      </tr>

      {open && draft && (
        <tr data-testid="product-quick-edit-row" className="bg-[#0b1526]/80">
          <td colSpan={9} className="border-b border-[#22385a]/40 px-6 py-4">
            <form
              data-testid="product-quick-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
              }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <Field label="原价(积分)">
                  <Input
                    inputMode="numeric"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  />
                </Field>
                <Field label="促销价(留空=无促销)">
                  <Input
                    inputMode="numeric"
                    value={draft.salePrice}
                    onChange={(e) => setDraft({ ...draft, salePrice: e.target.value })}
                  />
                </Field>
                <Field
                  label="库存"
                  hint={isService ? "服务类商品不使用库存" : undefined}
                >
                  <span className="flex items-center gap-2">
                    <Switch
                      checked={draft.stockEnabled && !isService}
                      disabled={isService}
                      ariaLabel="启用库存"
                      onChange={(v) => setDraft({ ...draft, stockEnabled: v })}
                    />
                    <Input
                      inputMode="numeric"
                      disabled={!draft.stockEnabled || isService}
                      value={draft.stock}
                      className="w-20"
                      onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                    />
                  </span>
                </Field>
                <Field label="发布状态">
                  <Select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    <option value="published">已发布</option>
                    <option value="draft">草稿</option>
                  </Select>
                </Field>
                <Field label="目录显隐">
                  <span className="flex h-[34px] items-center">
                    <Switch
                      checked={draft.listed}
                      ariaLabel="在目录展示"
                      onChange={(v) => setDraft({ ...draft, listed: v })}
                    />
                  </span>
                </Field>
                <Field label="首页精选">
                  <span className="flex h-[34px] items-center">
                    <Switch
                      checked={draft.featured}
                      ariaLabel="首页精选"
                      onChange={(v) => setDraft({ ...draft, featured: v })}
                    />
                  </span>
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? "保存中…" : "保存"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                  取消
                </Button>
                <ButtonLink
                  href={`/admin/products/${product.id}`}
                  variant="ghost"
                  size="sm"
                >
                  打开完整编辑 →
                </ButtonLink>
                {error && (
                  <span role="alert" className="text-[12.5px] text-[#eda9a9]">
                    {error}
                  </span>
                )}
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
