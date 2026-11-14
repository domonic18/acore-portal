import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

/** 嫌疑来源 IP 行(本地类型:组件不依赖 server 层的类型) */
type Offender = {
  ip: string;
  fails: number;
  targets: number;
  lastAt: string;
  locked: boolean;
};

/**
 * 嫌疑来源 IP 表(撞库加固 PR-J)。
 *
 * 「命中账号数」是本表的关键列:同一个账号反复试是手抖/爆破单账号,
 * 一个 IP 打穿几十个不同账号才是撞库——两者处置方式完全不同。
 */
export function SecurityTopOffenders({ offenders }: { offenders: Offender[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th>来源 IP</Th>
          <Th className="w-[90px]">失败次数</Th>
          <Th className="w-[100px]">命中账号数</Th>
          <Th className="w-[90px]">当前锁态</Th>
          <Th className="w-[160px]">最近失败</Th>
        </tr>
      </THead>
      <tbody>
        {offenders.length === 0 ? (
          <TableEmpty colSpan={5} label="窗口内没有登录失败" />
        ) : (
          offenders.map((o) => (
            <Tr key={o.ip}>
              <Td className="font-mono text-xs text-[#dcebf7]">{o.ip}</Td>
              <Td className="text-[#eda9a9]">{o.fails}</Td>
              <Td className="text-[#e8c877]">{o.targets}</Td>
              <Td>
                {o.locked ? <Badge tone="danger">已锁 IP</Badge> : <Badge tone="muted">未锁</Badge>}
              </Td>
              <Td className="text-xs text-[#6482a3]">
                {formatDateTime(o.lastAt)}
              </Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
