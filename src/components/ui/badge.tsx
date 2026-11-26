import { cn } from "@/lib/cn";

type Tone = "ok" | "muted" | "warn" | "danger" | "accent";

const TONE: Record<Tone, string> = {
  ok: "border-success-solid/30 bg-success-solid/10 text-success",
  muted: "border-border bg-card text-muted-foreground",
  warn: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  accent: "border-primary/30 bg-primary/10 text-primary-bright",
};

/** 后台状态徽章(订单态/库存态/角色等),tone 语义见各页面用法 */
export function Badge({
  tone = "muted",
  className,
  title,
  children,
}: {
  tone?: Tone;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] leading-4",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
