import Link from "next/link";
import {
  listProgressionTimeline,
  resolveProgressionPosition,
} from "@/server/services/progression/progression";
import { ContentPanel } from "@/components/site/content-panel";
import {
  formatPhaseDate,
  ProgressionTimeline,
} from "@/components/site/progression-timeline";
import { ProgressionCountdown } from "./countdown";
import { formatDate } from "@/lib/format";

/**
 * 渐进计划(T026,FR-211/SC-204):对齐源站 lokta.cn/?page_id=2796 的
 * 「左右交替竖向时间轴」——中心轴线 + 节点图标 + 日期置于卡片对侧 +
 * 4:3 图片 + 橙色标题 + 逐行正文(Markdown 硬换行原样保留)。
 * 布局件前后台共用(components/site/progression-timeline),后台在同款画布上就地编辑。
 */
export const metadata = { title: "渐进计划 · 老克塔" };

/** 阶段日期(存 UTC 零点)按东八区当日零点为开放时刻(倒计时口径) */
function phaseStartIso(phaseDate: Date): string {
  return `${formatDate(phaseDate)}T00:00:00+08:00`;
}

export default async function ProgressionPage() {
  const [nodes, position] = await Promise.all([
    listProgressionTimeline(),
    resolveProgressionPosition(),
  ]);
  const currentId = position.current?.id;
  const nextId = position.next?.id;

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <ContentPanel className="p-5 lg:p-6">
        <nav
          aria-label="面包屑"
          className="mb-3 flex flex-wrap items-center gap-2 text-[11px] lg:text-[13.5px]"
        >
          <Link href="/announcements" className="text-muted hover:text-link">
            公告
          </Link>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
          <span className="text-body">渐进计划</span>
        </nav>

        <h1 className="text-[26px] font-bold leading-tight text-heading lg:text-[32px]">
          渐进计划
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          服务器的整体渐进计划参照{" "}
          <a
            href="https://www.chromiecraft.com/en/progression/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:text-highlight"
          >
            Azerothcore 开源社区
          </a>{" "}
          而进行
        </p>

        <section
          aria-label="阶段概览"
          className="mt-5 rounded-xl border border-line bg-panel px-5 py-4"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-[13.5px] text-body">
                当前阶段：
                {position.current ? (
                  <a
                    href={`#node-${position.current.id}`}
                    className="font-semibold text-danger hover:underline"
                  >
                    {position.current.title}
                  </a>
                ) : (
                  <span className="text-muted">待定</span>
                )}
              </p>
              <p className="text-[13.5px] text-body">
                下一阶段：
                {position.next ? (
                  <a
                    href={`#node-${position.next.id}`}
                    className="font-semibold text-highlight hover:underline"
                  >
                    {position.next.title}
                  </a>
                ) : (
                  <span className="text-muted">暂无</span>
                )}
              </p>
              <p className="text-[12px] text-muted">
                北京时间 UTC+8 · 与服务器时间自动校准
              </p>
            </div>
            {position.next && (
              <ProgressionCountdown
                targetIso={
                  position.next.phaseDate ? phaseStartIso(position.next.phaseDate) : null
                }
              />
            )}
          </div>
        </section>

        <ProgressionTimeline
          items={nodes.map((n) => {
            const isCurrent = n.id === currentId;
            const isNext = n.id === nextId;
            const locked = n.status === "locked";
            return {
              key: n.id.toString(),
              anchorId: `node-${n.id}`,
              state: isCurrent ? "current" : locked ? "locked" : "open",
              dateLabel: formatPhaseDate(n.phaseDate),
              card: (
                <article
                  className={`rounded-xl border bg-panel shadow-[0_10px_40px_rgba(0,0,0,0.35)] ${
                    isCurrent
                      ? "border-highlight/60"
                      : locked
                        ? "border-line"
                        : "border-line-strong"
                  }`}
                >
                  <div className="p-4 lg:p-5">
                    {n.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={n.imageUrl}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full rounded-md object-cover"
                      />
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
                      <span className="text-[12.5px] text-foreground">
                        {formatPhaseDate(n.phaseDate)}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-highlight/12 px-2 py-0.5 text-[10.5px] text-highlight">
                          当前
                        </span>
                      )}
                      {isNext && (
                        <span className="rounded-full bg-link/12 px-2 py-0.5 text-[10.5px] text-num">
                          下一阶段
                        </span>
                      )}
                      {locked && !isNext && (
                        <span className="rounded-full bg-body/12 px-2 py-0.5 text-[10.5px] text-body">
                          未开放
                        </span>
                      )}
                    </div>
                    <h2 className="text-[14.5px] font-bold leading-6 text-highlight lg:text-[15px]">
                      {n.title}
                    </h2>
                    {n.bodyMd && (
                      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-body">
                        {n.bodyMd}
                      </p>
                    )}
                    <div className="mt-2 hidden flex-wrap items-center gap-2 lg:flex">
                      {isCurrent && (
                        <span className="rounded-full bg-highlight/12 px-2 py-0.5 text-[10.5px] text-highlight">
                          当前阶段
                        </span>
                      )}
                      {isNext && (
                        <span className="rounded-full bg-link/12 px-2 py-0.5 text-[10.5px] text-num">
                          下一阶段
                        </span>
                      )}
                      {locked && !isNext && (
                        <span className="rounded-full bg-body/12 px-2 py-0.5 text-[10.5px] text-body">
                          未开放
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ),
            };
          })}
        />

        {nodes.length === 0 && (
          <p className="mt-6 rounded-xl border border-line bg-panel py-16 text-center text-sm text-muted">
            暂无阶段数据。
          </p>
        )}
      </ContentPanel>
    </main>
  );
}
