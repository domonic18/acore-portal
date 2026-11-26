import { FOCUS_RING } from "./admin-tokens";
import { cn } from "@/lib/cn";

/** 后台统一表格外壳(横滚+深色圆角);保留语义 table,E2E 依赖 row/name 断言 */
export function Table({
  className,
  children,
  minWidth = "min-w-[680px]",
}: {
  className?: string;
  children: React.ReactNode;
  /** 窄屏横滚的最小表宽;少列表格可传 min-w-0 免滚动 */
  minWidth?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className={cn("w-full border-collapse text-[13px] text-foreground", minWidth)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-card/80 text-left">{children}</thead>
  );
}

export function Th({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      // 表头不折行(#48 移动端逐字竖排);窄屏由表格外壳横滚承担
      className={cn(
        "whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-normal text-faint-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tr({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={cn(
        "border-b border-border/40 transition last:border-b-0 hover:bg-hover",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  className,
  children,
  colSpan,
}: {
  className?: string;
  children?: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5 align-middle", className)}>
      {children}
    </td>
  );
}

/** 表格空态(跨列提示,替代各页手写) */
export function TableEmpty({ colSpan, label = "暂无数据" }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-[13px] text-faint-foreground">
        {label}
      </td>
    </tr>
  );
}

/** 行内链接(表格中查看/编辑入口,替代裸 a) */
export function TableCellLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "rounded text-primary underline-offset-2 hover:text-primary-bright hover:underline",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </a>
  );
}
