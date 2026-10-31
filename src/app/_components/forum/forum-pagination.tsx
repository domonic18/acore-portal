import Link from "next/link";

/** 论坛数字分页(p07 设计稿):左侧总计,右侧页码窗口 + 下一页 */
export function ForumPagination({
  page,
  totalPages,
  total,
  href,
  unit = "主题",
}: {
  page: number;
  totalPages: number;
  total: number;
  href: (page: number) => string;
  unit?: string;
}) {
  return (
    <nav
      aria-label="分页"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#22385a] px-5 py-4 text-[13px]"
    >
      <span className="text-[#6482a3]">
        共 {total} 个{unit} · 第 {page} / {totalPages} 页
      </span>
      <div className="ml-auto flex items-center gap-1">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded-lg px-2.5 py-1.5 text-[#93b2ce] hover:bg-[#1b2f4c] hover:text-[#a8d9f5]"
          >
            ← 上一页
          </Link>
        )}
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-[#6482a3]">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={
                p === page
                  ? "flex h-[30px] min-w-[30px] items-center justify-center rounded-lg bg-[#6fb7e0] px-1.5 font-semibold text-[#dcebf7]"
                  : "flex h-[30px] min-w-[30px] items-center justify-center rounded-lg px-1.5 text-[#93b2ce] hover:bg-[#1b2f4c] hover:text-[#a8d9f5]"
              }
            >
              {p}
            </Link>
          ),
        )}
        {page < totalPages && (
          <Link
            href={href(page + 1)}
            className="rounded-lg px-2.5 py-1.5 text-[#93b2ce] hover:bg-[#1b2f4c] hover:text-[#a8d9f5]"
          >
            下一页 →
          </Link>
        )}
      </div>
    </nav>
  );
}

/** 数字页码窗口:≤7 全列,否则 首/…/当前±1/…/末(null=省略号) */
function pageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const p of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && p - prev > 1) out.push(null);
    out.push(p);
  }
  return out;
}
