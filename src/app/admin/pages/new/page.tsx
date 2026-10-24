import Link from "next/link";
import { PageForm } from "@/components/admin/page-form";

/** 静态页新建(T032) */
export default function AdminPageNewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">新建静态页</h1>
        <Link href="/admin/pages" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>
      <PageForm />
    </div>
  );
}
