import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

/** 被锁账号行(本地类型:组件不依赖 server 层的类型) */
type LockedAccount = {
  username: string;
  ip: string | null;
  fails: number;
  lockedAt: string;
  locked: boolean;
};

/**
 * 近期被锁账号表(撞库加固 PR-J)。
 *
 * 被锁账号是**被撞的受害方**——旧实现把 IP 计数越阈当成锁账号的理由,
 * 攻击者一次请求就能锁一个受害者账号;这张表就是复盘「谁被牵连」的依据。
 */
export function SecurityLockedAccounts({ accounts }: { accounts: LockedAccount[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th>账号</Th>
          <Th>来源 IP</Th>
          <Th className="w-[90px]">失败次数</Th>
          <Th className="w-[90px]">当前锁态</Th>
          <Th className="w-[160px]">锁定时间</Th>
        </tr>
      </THead>
      <tbody>
        {accounts.length === 0 ? (
          <TableEmpty colSpan={5} label="窗口内没有被锁的账号" />
        ) : (
          accounts.map((a) => (
            <Tr key={a.username}>
              <Td className="font-medium text-[#dcebf7]">{a.username}</Td>
              <Td className="font-mono text-xs text-[#93b2ce]">{a.ip ?? "—"}</Td>
              <Td className="text-[#eda9a9]">{a.fails}</Td>
              <Td>
                {a.locked ? <Badge tone="danger">锁定中</Badge> : <Badge tone="muted">已解锁</Badge>}
              </Td>
              <Td className="text-xs text-[#6482a3]">
                {formatDateTime(a.lockedAt)}
              </Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
