import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import {
  listProgressionTimeline,
  resolveProgressionPosition,
} from "@/server/services/progression/progression";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";
import { ProgressionCountdown } from "./countdown";

/**
 * 渐进计划时间轴(T026,FR-211/SC-204;M4 对齐旧站 page 2796 复刻):
 * 顶部=参照句+当前/下一阶段红字锚点+下一阶段倒计时(旧站结构);
 * 本体=双侧交错时间轴(桌面),中线图标(节点 icon,空=默认圆点),日期在对侧,
 * 内容卡=4:3 配图+标题+说明;移动端回落单侧左线。locked 置灰。
 */
export const metadata = { title: "渐进计划 · 老克塔" };

/** 阶段日期(存 UTC 零点)按东八区当日零点为开放时刻(倒计时口径) */
function phaseStartIso(phaseDate: Date): string {
  return `${phaseDate.toISOString().slice(0, 10)}T00:00:00+08:00`;
}

export default async function ProgressionPage() {
  const [nodes, position] = await Promise.all([
    listProgressionTimeline(),
    resolveProgressionPosition(),
  ]);
  const cdnHosts = await getCdnHosts();
  const items = await Promise.all(
    nodes.map(async (n) => ({
      ...n,
      html: n.bodyMd ? (await renderMarkdown(n.bodyMd, { cdnHosts })).html : null,
    })),
  );
  const currentId = position.current?.id;
  const nextId = position.next?.id;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="border-b border-[#1e2a3d] pb-4">
          <h1 className="text-2xl font-bold text-[#e6d8a8]">渐进计划</h1>
          <p className="mt-2 text-xs text-[#5d6b80]">
            服务器的整体渐进计划参照
            <a
              href="https://www.chromiecraft.com/en/progression/"
              target="_blank"
              rel="noopener noreferrer"
              className="mx-1 text-[#8fa0b8] underline hover:text-[#c7d2e0]"
            >
              AzerothCore 开源社区
            </a>
            而进行
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <h2 className="text-center text-lg font-bold text-[#c7d2e0]">
              当前阶段:
              {position.current ? (
                <a
                  href={`#node-${position.current.id}`}
                  className="text-red-500 hover:underline"
                >
                  {position.current.title}
                </a>
              ) : (
                <span className="text-[#5d6b80]">待定</span>
              )}
            </h2>
            {position.next && (
              <>
                <h2 className="text-center text-lg font-bold text-[#c7d2e0]">
                  下一阶段:
                  <a
                    href={`#node-${position.next.id}`}
                    className="text-red-500 hover:underline"
                  >
                    {position.next.title}
                  </a>
                </h2>
                <ProgressionCountdown
                  targetIso={
                    position.next.phaseDate ? phaseStartIso(position.next.phaseDate) : null
                  }
                />
              </>
            )}
          </div>
        </header>

        {items.length > 0 && (
          <ol className="relative mt-8 space-y-8 before:absolute before:bottom-0 before:left-4 before:top-0 before:w-px before:bg-[#243350] md:before:left-1/2">
            {items.map((n, i) => {
              const isCurrent = n.id === currentId;
              const isNext = n.id === nextId;
              const locked = n.status === "locked";
              const flip = i % 2 === 1; // 双侧交错:偶数卡右/日期左,奇数卡左/日期右
              const dateText = n.phaseDate
                ? n.phaseDate.toISOString().slice(0, 10)
                : "未定档";
              return (
                <li
                  key={n.id}
                  id={`node-${n.id}`}
                  className={`relative scroll-mt-24 pl-12 md:pl-0 md:grid md:grid-cols-[1fr_3rem_1fr] ${
                    locked ? "opacity-50" : ""
                  }`}
                >
                  <span
                    className={`absolute left-4 top-0 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border text-sm md:static md:col-start-2 md:row-start-1 md:translate-x-0 md:justify-self-center ${
                      isCurrent
                        ? "border-[#c9a227] bg-[#c9a227]/20 text-[#e6d8a8]"
                        : "border-[#243350] bg-[#0d1728] text-[#8fa0b8]"
                    }`}
                    aria-hidden
                  >
                    {n.icon || "•"}
                  </span>

                  {/* 日期(桌面在对侧;移动并入卡片头) */}
                  <div
                    className={`hidden md:block md:row-start-1 md:self-start md:pt-1 text-sm text-[#5d6b80] ${
                      flip
                        ? "md:col-start-3 md:pl-8 md:text-left"
                        : "md:col-start-1 md:pr-8 md:text-right"
                    }`}
                  >
                    {dateText}
                    {isCurrent && <span className="ml-1 text-[#c9a227]">· 当前</span>}
                    {isNext && <span className="ml-1 text-[#c9a227]">· 下一阶段</span>}
                    {locked && <span className="ml-1">· 未开放</span>}
                  </div>

                  <div
                    className={`md:row-start-1 ${
                      flip ? "md:col-start-1 md:pr-8" : "md:col-start-3 md:pl-8"
                    }`}
                  >
                    <div
                      className={`rounded border p-4 ${
                        isCurrent
                          ? "border-[#c9a227] bg-[#16233a]"
                          : "border-[#1e2a3d] bg-[#0d1728]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-base font-bold text-[#e6d8a8]">{n.title}</h3>
                        <span className="shrink-0 text-xs text-[#5d6b80] md:hidden">
                          {dateText}
                        </span>
                      </div>
                      {n.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={n.imageUrl}
                          alt={n.title}
                          className="mt-3 aspect-[4/3] w-full max-w-md rounded border border-[#1e2a3d] object-cover"
                        />
                      )}
                      {n.html && (
                        <div
                          className="prose-invert mt-2 max-w-none text-sm leading-6 text-[#c7d2e0] [&_img]:max-w-full [&_p]:my-1"
                          dangerouslySetInnerHTML={{ __html: n.html }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <SiteSidebar pageType="progression" />
    </main>
  );
}
