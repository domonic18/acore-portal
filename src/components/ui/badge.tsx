type Tone = "ok" | "muted" | "warn" | "danger" | "accent";

const TONE: Record<Tone, string> = {
  ok: "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]",
  muted: "border-[#22385a] bg-[#13233a] text-[#93b2ce]",
  warn: "border-[#e8c877]/30 bg-[#e8c877]/10 text-[#e8c877]",
  danger: "border-[#eda9a9]/30 bg-[#eda9a9]/10 text-[#eda9a9]",
  accent: "border-[#6fb7e0]/30 bg-[#6fb7e0]/10 text-[#a8d9f5]",
};

/** 后台状态徽章(订单态/库存态/角色等),tone 语义见各页面用法 */
export function Badge({
  tone = "muted",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] leading-4 ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
