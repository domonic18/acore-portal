"use client";

import { Table, THead, Th, Tr, Td, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { McpRecentCall } from "@/constants/mcp";

/** 最近调用(③):工具名 / 目标 id / 成败 / 耗时 / 时刻 */
export function CallsPanel({ calls }: { calls: McpRecentCall[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[14px] font-semibold text-heading">最近调用</h2>
      <Table minWidth="min-w-[560px]">
        <THead>
          <tr>
            <Th>时刻</Th>
            <Th>工具</Th>
            <Th>结果</Th>
            <Th>目标</Th>
            <Th>耗时</Th>
          </tr>
        </THead>
        <tbody>
          {calls.length === 0 ? (
            <TableEmpty colSpan={5} label="暂无调用记录" />
          ) : (
            calls.map((call) => (
              <Tr key={call.id}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(call.createdAt)}</Td>
                <Td className="whitespace-nowrap">{call.tool || "—"}</Td>
                <Td className={call.ok ? "whitespace-nowrap text-ok-bright" : "whitespace-nowrap text-danger"}>
                  {call.ok ? "成功" : "失败"}
                </Td>
                <Td className="whitespace-nowrap font-mono text-[12px]">{call.targetId ?? "—"}</Td>
                <Td className="whitespace-nowrap text-muted">
                  {call.durationMs === null ? "—" : `${call.durationMs} ms`}
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </section>
  );
}
