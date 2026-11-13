import { notFound } from "next/navigation";
import { getAdminProduct, listAdminCategories } from "@/server/services/catalog/admin";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { ButtonLink } from "@/components/ui/button";
import { isoToDateTimeInput } from "@/lib/format";

/** 商品编辑(T048):读回现有商品为表单初值(含真实促销窗口与精选,issue #72);保存走 PATCH。 */
export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [product, categories] = await Promise.all([
    getAdminProduct(BigInt(id)),
    listAdminCategories(),
  ]);
  if (!product) notFound();

  const initial: ProductFormValues = {
    id: product.id,
    type: product.type,
    sku: product.sku,
    handlerKey: product.handlerKey,
    name: product.name,
    slug: product.slug,
    description: product.description,
    images: product.images,
    detailMd: product.detailMd,
    categoryId: product.categoryId,
    price: product.price,
    salePrice: product.salePrice,
    saleStart: isoToDateTimeInput(product.saleStart),
    saleEnd: isoToDateTimeInput(product.saleEnd),
    stockEnabled: product.stockEnabled,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    maxPerUser: product.maxPerUser,
    gameItemId: product.gameItemId,
    status: product.status,
    listed: product.listed,
    featured: product.featured,
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">编辑商品:{product.name}</h1>
        <ButtonLink href={`/admin/products/${product.id}/faq`} prefetch={false} size="sm">
          常见问题
        </ButtonLink>
      </div>
      <ProductForm
        initial={initial}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
