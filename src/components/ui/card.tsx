import { FOCUS_RING } from "./admin-tokens";
import { cn } from "@/lib/cn";

/** 后台卡片容器(仪表盘计数卡/看板区块/表单面板统一外壳);透传 section 属性(data-testid 等) */
export function Card({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section
      {...rest}
      className={cn("flex flex-col rounded-xl border border-border bg-card", className)}
    >
      {children}
    </section>
  );
}

/** 卡片标题行(title 左侧,actions 右侧可选) */
export function CardHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3",
        className,
      )}
    >
      <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
      {actions}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
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
    accent: "text-primary",
    warn: "text-warning",
    danger: "text-destructive",
    ok: "text-success",
  }[tone];
  const inner = (
    <>
      <span className={cn("shrink-0 [&>svg]:h-5 [&>svg]:w-5", toneCls)}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-7 text-foreground">
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-faint-foreground">{label}</span>
      </span>
    </>
  );
  const cls = cn(
    "flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40",
    FOCUS_RING,
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return <section className={cls}>{inner}</section>;
}
