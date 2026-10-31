import { notFound } from "next/navigation";
import { getAdminProduct, listAdminCategories } from "@/server/services/catalog/admin";
import { normalizeProductImages } from "@/server/services/catalog/products";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

/** 商品编辑(T048):读回现有商品为表单初值;保存走 PATCH。 */
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
    id: product.id.toString(),
    type: product.type,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description,
    images: normalizeProductImages(product.images),
    detailMd: product.detailMd ?? "",
    categoryId: product.category.id.toString(),
    price: product.price,
    salePrice: product.salePrice,
    saleStart: null,
    saleEnd: null,
    stockEnabled: product.stockEnabled,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    maxPerUser: product.maxPerUser,
    gameItemId: product.gameItemId,
    status: product.status,
    listed: product.listed,
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">编辑商品:{product.name}</h1>
      <ProductForm
        initial={initial}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
