import Link from "next/link";
import { notFound } from "next/navigation";
import { PageForm } from "@/components/admin/page-form";
import { getAdminPage } from "@/server/services/content/admin";
import { getSiteMapPageView } from "@/server/services/seo/sitemap";
import { CORE_PAGE_SLUGS, SYSTEM_GENERATED_PAGE_SLUGS } from "@/constants/content";
import { SiteMapSection } from "@/components/content/site-map-section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/**
 * 静态页编辑回填(T032)。
 * issue #94:系统生成页(/sitemap)的前台可见内容由 getSiteMapPageView() 生成,
 * content_page.body_md 只是可选导语——此处展示生成结果预览,后台与前台所见一致。
 * 核心静态页(CORE_PAGE_SLUGS)被站内固定链接引用,别名锁定不可改。
 */
export default async function AdminPageEditPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const page = await getAdminPage(BigInt(id));
  if (!page) notFound();
  const systemGenerated = SYSTEM_GENERATED_PAGE_SLUGS.includes(page.slug);
  const groups = systemGenerated ? await getSiteMapPageView() : null;
  const core = CORE_PAGE_SLUGS.includes(page.slug);
  const backLinkCls = `rounded text-sm text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-[#dcebf7]">编辑静态页</h1>
        <Link href={`/${page.slug}`} className={backLinkCls}>
          前台查看 ↗
        </Link>
        <Link prefetch={false} href="/admin/pages" className={backLinkCls}>
          ← 返回列表
        </Link>
      </div>
      {groups && (
        <Card>
          <CardHeader title="系统生成内容(前台实时显示)" />
          <CardBody>
            <p className="text-[13px] leading-6 text-[#93b2ce]">
              下列链接按栏目、论坛版块与商城分类自动生成,新增或改名后立即生效,无需在此维护;
              正文编辑器只用于撰写显示在链接上方的导语。
            </p>
            <SiteMapSection groups={groups} />
          </CardBody>
        </Card>
      )}
      <PageForm
        initial={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          bodyMd: page.bodyMd,
          status: page.status,
          sortOrder: page.sortOrder,
          tocEnabled: page.tocEnabled,
        }}
        lockedSlug={core}
        systemGenerated={systemGenerated}
      />
    </div>
  );
}
