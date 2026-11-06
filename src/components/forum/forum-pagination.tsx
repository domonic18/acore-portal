import Link from "next/link";
import { pageWindow } from "@/lib/pagination";

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
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-5 py-4 text-[13px]"
    >
      <span className="text-muted">
        共 {total} 个{unit} · 第 {page} / {totalPages} 页
      </span>
      <div className="ml-auto flex items-center gap-1">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded-lg px-2.5 py-1.5 text-body hover:bg-surface-alt hover:text-num"
          >
            ← 上一页
          </Link>
        )}
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={
                p === page
                  ? "flex h-[30px] min-w-[30px] items-center justify-center rounded-lg bg-link px-1.5 font-semibold text-heading"
                  : "flex h-[30px] min-w-[30px] items-center justify-center rounded-lg px-1.5 text-body hover:bg-surface-alt hover:text-num"
              }
            >
              {p}
            </Link>
          ),
        )}
        {page < totalPages && (
          <Link
            href={href(page + 1)}
            className="rounded-lg px-2.5 py-1.5 text-body hover:bg-surface-alt hover:text-num"
          >
            下一页 →
          </Link>
        )}
      </div>
    </nav>
  );
}
