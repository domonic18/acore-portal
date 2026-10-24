import { getServerStatus } from "@/server/services/status/status";

/** 公开状态聚合(契约 server-status.md:无鉴权,聚合统计非敏感,角色明细不出库) */
export async function GET() {
  const status = await getServerStatus();
  return Response.json(status);
}
