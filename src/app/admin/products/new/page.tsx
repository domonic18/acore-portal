import { listAdminCategories } from "@/server/services/catalog/admin";
import { ProductForm } from "@/components/admin/product-form";

/** 商品新建(T048):分类下拉来自 product_category;校验在服务端(FR-126)。 */
export default async function NewProductPage() {
  const categories = await listAdminCategories();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">新建商品</h1>
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
