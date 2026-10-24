import { renderMarkdown } from "@/lib/markdown";
import {
  listProgressionTimeline,
  resolveProgressionPosition,
} from "@/server/services/progression/progression";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";

/**
 * 渐进计划时间轴(T026,FR-211/SC-204):phaseDate 升序 NULLS LAST;
 * 锚点导航+当前/下一高亮+locked 置灰;信息与旧站时间轴等价。
 */
export const metadata = { title: "渐进计划 · 老克塔" };

export default async function ProgressionPage() {
  const [nodes, position] = await Promise.all([
    listProgressionTimeline(),
    resolveProgressionPosition(),
  ]);
  const items = await Promise.all(
    nodes.map(async (n) => ({
      ...n,
      html: n.bodyMd ? (await renderMarkdown(n.bodyMd)).html : null,
    })),
  );
  const currentId = position.current?.id;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="border-b border-[#1e2a3d] pb-3">
          <h1 className="text-2xl font-bold text-[#e6d8a8]">渐进计划</h1>
          <p className="mt-1 text-xs text-[#5d6b80]">
            当前阶段:{position.current?.title ?? "待定"}
            {position.next && ` · 下一阶段:${position.next.title}`}
          </p>
        </header>

        {items.length > 0 && (
          <nav
            aria-label="阶段导航"
            className="mt-4 flex flex-wrap gap-2 text-xs"
          >
            {items.map((n) => (
              <a
                key={n.id}
                href={`#node-${n.id}`}
                className={`rounded border px-2 py-1 ${
                  n.id === currentId
                    ? "border-[#c9a227] text-[#e6d8a8]"
                    : "border-[#243350] text-[#8fa0b8] hover:border-[#c9a227]"
                }`}
              >
                {n.title}
              </a>
            ))}
          </nav>
        )}

        <ol className="mt-6 space-y-6 border-l border-[#1e2a3d] pl-6">
          {items.map((n) => {
            const isCurrent = n.id === currentId;
            const isNext = position.next?.id === n.id;
            const locked = n.status === "locked";
            return (
              <li
                key={n.id}
                id={`node-${n.id}`}
                className={`relative scroll-mt-24 ${locked ? "opacity-50" : ""}`}
              >
                <span
                  className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border ${
                    isCurrent
                      ? "border-[#c9a227] bg-[#c9a227]"
                      : "border-[#243350] bg-[#0d1728]"
                  }`}
                />
                <div
                  className={`rounded border p-4 ${
                    isCurrent
                      ? "border-[#c9a227] bg-[#16233a]"
                      : "border-[#1e2a3d] bg-[#0d1728]"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-base font-bold text-[#e6d8a8]">
                      {n.title}
                    </h2>
                    <span className="shrink-0 text-xs text-[#5d6b80]">
                      {n.phaseDate
                        ? n.phaseDate.toISOString().slice(0, 10)
                        : "未定档"}
                      {isCurrent && " · 当前"}
                      {isNext && " · 下一阶段"}
                      {locked && " · 未开放"}
                    </span>
                  </div>
                  {n.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={n.imageUrl}
                      alt={n.title}
                      className="mt-3 max-h-64 rounded border border-[#1e2a3d]"
                    />
                  )}
                  {n.html && (
                    <div
                      className="prose-invert mt-2 max-w-none text-sm leading-6 text-[#c7d2e0] [&_img]:max-w-full [&_p]:my-1"
                      dangerouslySetInnerHTML={{ __html: n.html }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <SiteSidebar pageType="progression" />
    </main>
  );
}
