import Link from "next/link";
import { PageForm } from "@/components/admin/page-form";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/** 静态页新建(T032) */
export default function AdminPageNewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">新建静态页</h1>
        <Link
          prefetch={false}
          href="/admin/pages"
          className={`rounded text-sm text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
        >
          ← 返回列表
        </Link>
      </div>
      <PageForm />
    </div>
  );
}
