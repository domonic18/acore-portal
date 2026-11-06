import { AUDIT_ACTION_LABEL } from "@/constants/audit";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";

/** 审计行(本地类型:组件不依赖 server 层的类型) */
type AuditRow = {
  id: string;
  action: string;
  ip: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

/** payload 摘要取用的键(白名单:审计只记事件,摘要不外泄原始内容) */
const SUMMARY_KEYS = [
  "username",
  "reason",
  "fails",
  "ip",
  "kind",
  "count",
  "threshold",
  "windowSec",
  "locked",
  "stage",
  "surface",
] as const;

function summarize(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of SUMMARY_KEYS) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    parts.push(`${key}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(" · ") || "—";
}

/**
 * 近期安全审计流水表(撞库加固 PR-J)。
 *
 * 审计此前只写不读——这张表就是「撞了谁、从哪来、什么时候」的一手依据。
 */
export function SecurityRecentAudit({ rows }: { rows: AuditRow[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th className="w-[160px]">时间</Th>
          <Th className="w-[130px]">动作</Th>
          <Th className="w-[140px]">来源 IP</Th>
          <Th>详情</Th>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={4} label="窗口内没有安全审计记录" />
        ) : (
          rows.map((r) => (
            <Tr key={r.id}>
              <Td className="text-xs text-[#6482a3]">
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </Td>
              <Td className="text-[#dcebf7]">{AUDIT_ACTION_LABEL[r.action] ?? r.action}</Td>
              <Td className="font-mono text-xs text-[#93b2ce]">{r.ip ?? "—"}</Td>
              <Td className="text-xs text-[#93b2ce]">{summarize(r.payload)}</Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
