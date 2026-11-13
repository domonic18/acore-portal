import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminProduct, listAdminProductFaqs } from "@/server/services/catalog/admin";
import { ProductFaqManager } from "@/components/admin/product-faq-manager";

/**
 * 商品常见问题后台(#159):按商品维护问答,前台商品详情页只读展示。
 * 入口挂在商品编辑页(FAQ 是商品的子资源,不另起一级菜单)。
 */
export default async function ProductFaqPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const product = await getAdminProduct(BigInt(id));
  if (!product) notFound();
  const faqs = await listAdminProductFaqs(BigInt(id));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">常见问题:{product.name}</h1>
        <Link
          href={`/admin/products/${product.id}`}
          prefetch={false}
          className="text-sm text-[#6fb7e0] hover:underline"
        >
          返回商品编辑
        </Link>
      </div>
      <p className="text-sm text-[#6482a3]">
        这里的问答会显示在商城该商品的详情页,顺序即前台展示顺序。
      </p>
      <ProductFaqManager
        productId={product.id}
        initialFaqs={faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))}
      />
    </div>
  );
}
