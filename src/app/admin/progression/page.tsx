import { requireAdmin } from "@/server/session-guard";
import { listAdminProgression } from "@/server/services/progression/progression";
import { ProgressionAdmin } from "@/components/admin/progression-admin";

/** 渐进计划节点管理页(T048 契约补全;T032 遗留的第 5 后台域) */
export default async function AdminProgressionPage() {
  await requireAdmin();
  const nodes = await listAdminProgression();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">渐进计划</h1>
      <ProgressionAdmin nodes={nodes} />
    </div>
  );
}
