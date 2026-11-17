import { Search } from "lucide-react";

import { SEARCH_GROUP_LABELS, SEARCH_GROUPS } from "@/constants/search";
import { getConfig } from "@/lib/config";
import {
  extractTerms,
  highlightParts,
  type HighlightPart,
} from "@/server/services/search/highlight";
import { searchSite, type SearchSiteResult } from "@/server/services/search";
import type { SearchHit } from "@/server/services/search/entities";

import { SearchChat } from "./search-chat";

export const metadata = { title: "站内搜索 · 老克塔" };

/**
 * /search(W7 接管):llm chat 通道配齐 → Agent 问答页(与右下角抽屉同一
 * 后端,大版心形态);通道未配 → 降级态,保留 W1 关键词列表(纯 GET form
 * 无客户端 JS),提示管理员在后台配置 AI 模型通道后开启。高亮 <mark> 渲染
 * 由 React 转义,无注入面。
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { llm } = await getConfig();
  const aiReady = Boolean(llm.baseUrl && llm.apiKey && llm.model);
  if (aiReady) return <AgentSearch />;

  const q = (searchParams.q ?? "").trim();
  const result = q ? await searchSite({ q }) : null;
  const terms = extractTerms(q);
  return (
    <main className="container-site flex-1 py-6">
      {result === null ? (
        <Hero />
      ) : (
        <Results result={result} q={q} terms={terms} />
      )}
    </main>
  );
}

function AgentSearch() {
  return (
    <main className="container-site flex-1 py-6">
      <div className="mx-auto max-w-[880px]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-line bg-panel">
            <Search className="size-5 text-highlight" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-heading">问问老克塔助手</h1>
            <p className="mt-0.5 text-sm text-muted">
              用一句话提问,助手检索站内攻略、说明、商品与帖子后作答
            </p>
          </div>
        </div>
        <SearchChat />
      </div>
    </main>
  );
}

function Hero() {
  return (
    <div className="flex flex-col items-center py-16 text-center md:py-24">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-panel">
        <Search className="size-7 text-highlight" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-heading">站内搜索</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        搜索攻略文章、使用说明、商城商品与论坛主题
      </p>
      <div className="mt-8 w-full max-w-xl">
        <SearchForm />
      </div>
      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {SEARCH_GROUPS.map((g) => (
          <li
            key={g}
            className="rounded-full border border-line bg-chip px-3 py-1 text-xs text-muted"
          >
            {SEARCH_GROUP_LABELS[g]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchForm({ q = "" }: { q?: string }) {
  return (
    <form action="/search" method="get" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="输入关键词,如:天赋、附魔、改名…"
        aria-label="搜索关键词"
        className="h-11 w-full min-w-0 rounded-lg border border-line bg-panel px-4 text-sm text-body placeholder:text-muted focus:border-link focus:outline-none"
      />
      <button
        type="submit"
        className="h-11 shrink-0 rounded-lg bg-highlight-deep px-5 text-sm font-medium text-ink hover:bg-highlight-deep-hover"
      >
        搜索
      </button>
    </form>
  );
}

function Results({
  result,
  q,
  terms,
}: {
  result: SearchSiteResult;
  q: string;
  terms: string[];
}) {
  const hits = result.groups.flatMap((g) => g.hits);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-panel px-5 py-4">
        <h1 className="text-lg font-semibold text-heading">站内搜索</h1>
        <div className="mt-3">
          <SearchForm q={q} />
        </div>
      </div>
      {!result.semantic && (
        <div
          role="status"
          className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn"
        >
          AI 语义检索尚未启用,当前结果来自关键词匹配;管理员可在后台配置 AI
          模型通道后开启。
        </div>
      )}
      {hits.length === 0 ? (
        <EmptyState q={q} />
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            找到 <span className="font-medium text-highlight">{result.total}</span>{" "}
            条与「{q}」相关的结果
          </p>
          <ul className="overflow-hidden rounded-xl border border-line bg-panel">
            {hits.map((hit) => (
              <HitRow key={hit.key} hit={hit} terms={terms} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function HitRow({ hit, terms }: { hit: SearchHit; terms: string[] }) {
  return (
    <li className="border-t border-line px-5 py-4 transition-colors first:border-t-0 hover:bg-panel-hover">
      <div className="flex items-center gap-2">
        <span className="rounded bg-chip px-1.5 py-0.5 text-xs text-muted">
          {hit.groupLabel}
        </span>
        {hit.faq && (
          <span className="rounded bg-chip px-1.5 py-0.5 text-xs text-highlight-soft">
            常见问题
          </span>
        )}
      </div>
      <a
        href={hit.url}
        className="mt-2 block text-base font-medium text-heading hover:text-link"
      >
        <Highlighted text={hit.title} terms={terms} />
      </a>
      <p className="mt-1 line-clamp-2 text-sm text-body">
        <Highlighted text={hit.snippet} terms={terms} />
      </p>
      <p className="mt-1 truncate text-xs text-muted">{hit.url}</p>
    </li>
  );
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const parts = highlightParts(text, terms);
  return (
    <>
      {parts.map((part: HighlightPart, i: number) =>
        part.hit ? (
          <mark key={i}>{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center">
      <p className="text-sm text-body">未找到与「{q}」相关的内容</p>
      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        <li>换个说法,或拆成更短的关键词</li>
        <li>检查是否有错别字</li>
        <li>可搜索范围:攻略文章 / 使用说明 / 商城商品 / 论坛主题</li>
      </ul>
    </div>
  );
}
