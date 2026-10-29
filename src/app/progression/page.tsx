import Link from "next/link";
import {
  listProgressionTimeline,
  resolveProgressionPosition,
  type ProgressionNodeView,
} from "@/server/services/progression/progression";
import { ProgressionCountdown } from "./countdown";

/**
 * 渐进计划(T026,FR-211/SC-204;2026-10 ardot p02 对齐):
 * 面包屑 + 三卡(当前/下一/远期) + 下一阶段倒计时横幅 + 按年代分组的阶段行
 * (缩略图 + 日期 + 标题 + 说明,locked 置灰)。年代由标题档位/关键词归组,
 * 数据模型无独立年代字段,故归组失败落入「其他阶段」。
 */
export const metadata = { title: "渐进计划 · 老克塔" };

/** 阶段日期(存 UTC 零点)按东八区当日零点为开放时刻(倒计时口径) */
function phaseStartIso(phaseDate: Date): string {
  return `${phaseDate.toISOString().slice(0, 10)}T00:00:00+08:00`;
}

const ERAS = [
  { key: "vanilla", name: "经典旧世 · 60 级", tag: "PHASE 1 · VANILLA" },
  { key: "tbc", name: "燃烧的远征 · 外域", tag: "PHASE 2 · TBC" },
  { key: "wotlk", name: "巫妖王之怒 · 诺森德", tag: "PHASE 3 · WRATH" },
  { key: "other", name: "其他阶段", tag: "OTHERS" },
] as const;

type EraKey = (typeof ERAS)[number]["key"];

/** 年代归组:标题档位前缀优先(60级/61-64级/70级/71-74级…),其次关键词 */
function eraOf(title: string): EraKey {
  const level = /^(\d+)(?:-\d+)?级/.exec(title);
  if (level) {
    const lv = Number(level[1]);
    if (lv <= 60) return "vanilla";
    if (lv <= 70) return "tbc";
    return "wotlk";
  }
  if (/外域|燃烧的远征|TBC/i.test(title)) return "tbc";
  if (/诺森德|巫妖|WLK|冰冠|红玉|Tier/i.test(title)) return "wotlk";
  if (/香草|经典旧世|60\s*级/.test(title)) return "vanilla";
  return "other";
}

/** 正文纯文本摘要(行内截断,避免缩略图行内渲染富文本/图片) */
function plainExcerpt(md: string | null): string {
  if (!md) return "";
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "未定档";
}

type ProgressionRow = ProgressionNodeView & { excerpt: string };

type EraGroup = {
  key: EraKey;
  name: string;
  tag: string;
  nodes: ProgressionRow[];
};

function groupByEra(nodes: ProgressionRow[]): EraGroup[] {
  const buckets = new Map<EraKey, ProgressionRow[]>();
  for (const n of nodes) {
    const key = eraOf(n.title);
    buckets.set(key, [...(buckets.get(key) ?? []), n]);
  }
  return ERAS.filter((e) => buckets.has(e.key)).map((e) => ({
    key: e.key,
    name: e.name,
    tag: e.tag,
    nodes: buckets.get(e.key) ?? [],
  }));
}

function eraRange(group: EraGroup): string {
  const dates = group.nodes
    .map((n) => n.phaseDate)
    .filter((d): d is Date => d != null);
  const range =
    dates.length === 0
      ? "档期待定"
      : dates.length === 1
        ? fmtDate(dates[0]!)
        : `${fmtDate(dates[0]!)} → ${fmtDate(dates[dates.length - 1]!)}`;
  return `${range} · ${group.nodes.length} 档`;
}

export default async function ProgressionPage() {
  const [nodes, position] = await Promise.all([
    listProgressionTimeline(),
    resolveProgressionPosition(),
  ]);
  const items: ProgressionRow[] = nodes.map((n) => ({
    ...n,
    excerpt: plainExcerpt(n.bodyMd),
  }));
  const currentId = position.current?.id;
  const nextId = position.next?.id;
  const groups = groupByEra(items);
  const farthestLocked = [...nodes]
    .reverse()
    .find((n) => n.status === "locked" && n.id !== position.next?.id);

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <h1 className="sr-only">渐进计划</h1>
      <nav
        aria-label="面包屑"
        className="mb-3 flex flex-wrap items-center gap-2 text-[11px] lg:text-[13.5px]"
      >
        <Link href="/announcements" className="text-[#6482a3] hover:text-[#6fb7e0]">
          公告
        </Link>
        <span aria-hidden="true" className="text-[#6482a3]">
          ›
        </span>
        <span className="text-[#93b2ce]">渐进计划</span>
        <span className="hidden text-[#6482a3] lg:ml-2 lg:inline">
          硬核渐进开放：60 级经典旧世 → 70 级燃烧的远征 → 80 级巫妖王之怒，逐档解锁
        </span>
      </nav>

      <section aria-label="阶段概览" className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4">
          <p className="text-[12.5px] text-[#e8c877]">当前阶段</p>
          <p className="mt-1.5 text-[19px] font-bold leading-7 text-[#dcebf7]">
            {position.current ? (
              <a
                href={`#node-${position.current.id}`}
                className="hover:text-[#a8d9f5]"
              >
                {position.current.title}
              </a>
            ) : (
              <span className="text-[#93b2ce]">待定</span>
            )}
          </p>
          <p className="mt-1 text-[12.5px] text-[#6482a3]">
            {position.current ? "已开放 · 持续进行中" : "指针未设置"}
          </p>
        </div>

        <div className="rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4">
          <p className="text-[12.5px] text-[#a8d9f5]">下一阶段</p>
          <h2 className="mt-1.5 text-[19px] font-bold leading-7 text-[#dcebf7]">
            {position.next ? (
              <a href={`#node-${position.next.id}`} className="hover:text-[#a8d9f5]">
                {position.next.title}
              </a>
            ) : (
              <span className="text-[#93b2ce]">暂无</span>
            )}
          </h2>
          <p className="mt-1 text-[12.5px] text-[#6482a3]">
            {position.next
              ? `开放时间 ${fmtDate(position.next.phaseDate)} · 北京时间 UTC+8`
              : "等待排期"}
          </p>
        </div>

        <div className="rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4">
          <p className="text-[12.5px] text-[#6482a3]">远期 · 下个大版本</p>
          <h2 className="mt-1.5 text-[19px] font-bold leading-7 text-[#dcebf7]">
            {farthestLocked ? (
              <a href={`#node-${farthestLocked.id}`} className="hover:text-[#a8d9f5]">
                {farthestLocked.title}
              </a>
            ) : (
              <span className="text-[#93b2ce]">待公布</span>
            )}
          </h2>
          <p className="mt-1 text-[12.5px] text-[#6482a3]">逐档解锁 · 敬请期待</p>
        </div>
      </section>

      {position.next && (
        <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[#6fb7e0]/12 px-2.5 py-0.5 text-[11px] text-[#a8d9f5]">
              下一阶段 · NEXT
            </span>
            <p className="mt-2 text-[16px] font-bold text-[#dcebf7]">
              {position.next.title}
            </p>
            <p className="mt-1 text-[12px] text-[#6482a3]">
              开放时间 {position.next.phaseDate ? `${fmtDate(position.next.phaseDate)} 00:00` : "待定档"}
              {" · "}北京时间 UTC+8 · 与服务器时间自动校准
            </p>
          </div>
          <ProgressionCountdown
            targetIso={
              position.next.phaseDate ? phaseStartIso(position.next.phaseDate) : null
            }
          />
        </section>
      )}

      <h2 className="mt-8 text-[17px] font-semibold text-[#dcebf7]">全部阶段</h2>
      <div className="mt-3 space-y-7">
        {groups.map((group) => {
          const banner = group.nodes.find((n) => n.imageUrl)?.imageUrl ?? null;
          return (
            <section key={group.key} aria-label={group.name}>
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="border-l-[3px] border-[#6fb7e0] pl-2.5 text-[15px] font-semibold text-[#dcebf7]">
                  {group.name}
                </h3>
                <span className="text-[12px] text-[#6482a3]">{eraRange(group)}</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a]">
                {banner && (
                  <div className="relative h-[64px] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={banner} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-l from-[#050a12]/85 via-[#050a12]/25 to-transparent" />
                    <span className="absolute bottom-2 right-4 text-[12px] text-[#a8d9f5]">
                      {group.tag}
                    </span>
                  </div>
                )}

                <ol>
                  {group.nodes.map((n) => {
                    const isCurrent = n.id === currentId;
                    const isNext = n.id === nextId;
                    const locked = n.status === "locked";
                    return (
                      <li
                        key={n.id}
                        id={`node-${n.id}`}
                        className={`scroll-mt-24 border-t border-[#22385a] first:border-t-0 ${
                          locked ? "opacity-55" : ""
                        }`}
                      >
                        <div className="flex items-start gap-4 px-5 py-3.5">
                          <div className="flex w-2.5 shrink-0 flex-col items-center self-stretch pt-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full border ${
                                isCurrent
                                  ? "border-[#e8c877] bg-[#e8c877]"
                                  : locked
                                    ? "border-[#35577f] bg-[#0d1828]"
                                    : "border-[#0a1220] bg-[#6fb7e0]"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="mt-1 w-px flex-1 bg-[#22385a]" aria-hidden="true" />
                          </div>

                          {n.imageUrl && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={n.imageUrl}
                              alt=""
                              className="hidden h-[58px] w-[78px] shrink-0 rounded-[7px] border border-[#35577f] object-cover sm:block"
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span
                                className={`text-[11.5px] ${
                                  isCurrent ? "text-[#e8c877]" : "text-[#93b2ce]"
                                }`}
                              >
                                {fmtDate(n.phaseDate)}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-[#e8c877]/12 px-2 py-0.5 text-[10.5px] text-[#e8c877]">
                                  当前
                                </span>
                              )}
                              {isNext && (
                                <span className="rounded-full bg-[#6fb7e0]/12 px-2 py-0.5 text-[10.5px] text-[#a8d9f5]">
                                  下一阶段
                                </span>
                              )}
                              {locked && (
                                <span className="rounded-full bg-[#93b2ce]/12 px-2 py-0.5 text-[10.5px] text-[#93b2ce]">
                                  未开放
                                </span>
                              )}
                            </div>
                            <h4 className="mt-0.5 text-[14.5px] font-semibold text-[#dcebf7]">
                              {n.title}
                            </h4>
                            {n.excerpt && (
                              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-[#6482a3]">
                                {n.excerpt}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          );
        })}
      </div>

      {nodes.length === 0 && (
        <p className="mt-4 rounded-xl border border-[#22385a] bg-[#13233a] py-16 text-center text-sm text-[#6482a3]">
          暂无阶段数据。
        </p>
      )}
    </main>
  );
}
