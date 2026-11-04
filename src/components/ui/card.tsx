import { FOCUS_RING } from "./admin-tokens";

/** 后台卡片容器(仪表盘计数卡/看板区块/表单面板统一外壳);透传 section 属性(data-testid 等) */
export function Card({
  className = "",
  children,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section
      {...rest}
      className={`flex flex-col rounded-xl border border-[#22385a] bg-[#13233a] ${className}`}
    >
      {children}
    </section>
  );
}

/** 卡片标题行(title 左侧,actions 右侧可选) */
export function CardHeader({
  title,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#22385a]/70 px-4 py-3 ${className}`}
    >
      <h2 className="text-[14px] font-semibold text-[#dcebf7]">{title}</h2>
      {actions}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/** 仪表盘计数卡(图标+数值+标签,链接经 href 包裹) */
export function StatCard({
  icon,
  value,
  label,
  href,
  tone = "accent",
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  href?: string;
  tone?: "accent" | "warn" | "danger" | "ok";
}) {
  const toneCls = {
    accent: "text-[#6fb7e0]",
    warn: "text-[#e8c877]",
    danger: "text-[#eda9a9]",
    ok: "text-[#6ee7b7]",
  }[tone];
  const inner = (
    <>
      <span className={`shrink-0 [&>svg]:h-5 [&>svg]:w-5 ${toneCls}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-7 text-[#dcebf7]">
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-[#6482a3]">{label}</span>
      </span>
    </>
  );
  const cls = `flex items-center gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4 transition hover:border-[#6fb7e0]/40 ${FOCUS_RING}`;
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return <section className={cls}>{inner}</section>;
}
