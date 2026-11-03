import Link from "next/link";

type PaginationTone = "admin" | "compact" | "shop" | "account";

const TONE_CLASS: Record<
  PaginationTone,
  { nav: string; link: string; disabled: string; current: string; fraction?: boolean }
> = {
  admin: {
    nav: "flex items-center gap-4",
    link: "rounded text-[#6fb7e0] hover:text-[#a8d9f5] hover:underline",
    disabled: "text-[#6482a3]",
    current: "",
  },
  compact: {
    nav: "flex items-center gap-3 text-sm text-gray-400",
    link: "hover:text-white",
    disabled: "text-gray-600",
    current: "",
    fraction: true,
  },
  shop: {
    nav: "flex items-center justify-center gap-4",
    link: "text-sm text-gray-300 hover:text-white",
    disabled: "text-sm text-gray-600",
    current: "text-sm text-gray-400",
  },
  account: {
    nav: "flex items-center justify-between text-sm",
    link: "text-blue-400 hover:underline",
    disabled: "text-gray-600",
    current: "text-gray-500",
  },
};

/** 上一页 / 页码 / 下一页三件套;各调用方仅配色与布局不同,≤1 页不渲染 */
export function PaginationNav({
  page,
  totalPages,
  href,
  tone = "admin",
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
  tone?: PaginationTone;
}) {
  if (totalPages <= 1) return null;
  const style = TONE_CLASS[tone];
  const indicator = style.fraction
    ? `${page} / ${totalPages}`
    : `第 ${page} / ${totalPages} 页`;
  return (
    <nav aria-label="分页" className={style.nav}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={style.link}>
          上一页
        </Link>
      ) : (
        <span className={style.disabled}>上一页</span>
      )}
      <span className={style.current}>{indicator}</span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={style.link}>
          下一页
        </Link>
      ) : (
        <span className={style.disabled}>下一页</span>
      )}
    </nav>
  );
}

/** 后台列表分页行:左侧总数、中间翻页、右侧可选每页条数提示 */
export function AdminPager({
  page,
  totalPages,
  total,
  unit,
  href,
  hint,
}: {
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  href: (page: number) => string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm text-[#6482a3]">
      <span>
        共 {total} {unit}
      </span>
      <PaginationNav page={page} totalPages={totalPages} href={href} />
      {hint && <span className="text-xs text-[#6482a3]/70">{hint}</span>}
    </div>
  );
}
