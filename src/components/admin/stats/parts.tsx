import { Card, CardBody, CardHeader } from "@/components/ui/card";

/**
 * 看板区块公共件(2026-11-07 数据看板重构):
 * 区块外壳 + 占比条列表 + 空态,各业务面板复用,避免每块各写一遍样式。
 */

/** 看板区块外壳(卡片 + 标题行 + 内容区) */
export function Panel({
  title,
  testid,
  actions,
  hint,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: React.ReactNode;
  testid?: string;
  actions?: React.ReactNode;
  /** 标题下方的口径说明(数据来源/统计窗口) */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card data-testid={testid} className={className}>
      <CardHeader title={title} actions={actions} />
      <CardBody className={`flex flex-col gap-3 ${bodyClassName}`}>
        {hint && <p className="text-[11.5px] leading-relaxed text-[#6482a3]">{hint}</p>}
        {children}
      </CardBody>
    </Card>
  );
}

/** 区块内小标题(画像分组的维度名) */
export function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12px] font-medium text-[#93b2ce]">{children}</h3>;
}

/** 占比条列表(名称 + 数值 + 相对量条);行业看板常见的 Top-N 排行样式 */
export function ShareList({
  items,
  empty = "暂无数据。",
  mono = false,
}: {
  items: { name: string; count: number }[];
  empty?: string;
  /** 名称用等宽字体(路径类) */
  mono?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[#6482a3]">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-2.5">
          <span
            className={`min-w-0 flex-1 truncate text-[13px] text-[#c4d9ec] ${mono ? "font-mono text-[12px]" : ""}`}
          >
            {item.name}
          </span>
          <span className="w-[70px] shrink-0 text-right font-mono text-[12.5px] text-[#dcebf7]">
            {item.count.toLocaleString("zh-CN")}
          </span>
          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[#1d3252]">
            <span
              className="block h-full rounded-full bg-[#6fb7e0]/70"
              style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
