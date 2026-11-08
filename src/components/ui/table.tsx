import { FOCUS_RING } from "./admin-tokens";

/** 后台统一表格外壳(横滚+深色圆角);保留语义 table,E2E 依赖 row/name 断言 */
export function Table({
  className = "",
  children,
  minWidth = "min-w-[680px]",
}: {
  className?: string;
  children: React.ReactNode;
  /** 窄屏横滚的最小表宽;少列表格可传 min-w-0 免滚动 */
  minWidth?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-[#22385a] ${className}`}>
      <table className={`w-full ${minWidth} border-collapse text-[13px] text-[#dcebf7]`}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-[#13233a]/80 text-left">{children}</thead>
  );
}

export function Th({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      // 表头不折行(#48 移动端逐字竖排);窄屏由表格外壳横滚承担
      className={`whitespace-nowrap border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3] ${className}`}
    >
      {children}
    </th>
  );
}

export function Tr({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr className={`border-b border-[#22385a]/40 transition last:border-b-0 hover:bg-[#16283f] ${className}`}>
      {children}
    </tr>
  );
}

export function Td({
  className = "",
  children,
  colSpan,
}: {
  className?: string;
  children?: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 align-middle ${className}`}>
      {children}
    </td>
  );
}

/** 表格空态(跨列提示,替代各页手写) */
export function TableEmpty({ colSpan, label = "暂无数据" }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-[13px] text-[#6482a3]">
        {label}
      </td>
    </tr>
  );
}

/** 行内链接(表格中查看/编辑入口,替代裸 a) */
export function TableCellLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING} ${className}`}
    >
      {children}
    </a>
  );
}
