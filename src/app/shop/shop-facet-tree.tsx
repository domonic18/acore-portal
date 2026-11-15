"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { SHOP_CATEGORY_ACCENTS } from "@/constants/shop";
import type { CategoryNode } from "@/lib/catalog-tree";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";

/**
 * 商城分类分面树:
 * - 分类语义「单分类 + 父子聚合」:点父分类看到整棵子树的商品,计数为子树合计;
 * - 行是**链接**(筛选状态进 URL,可分享可回退);点已选中的分类即取消该分类;
 * - 尖角是展开/收起按钮(与筛选正交:展开看子级,不改变结果);
 * - 计数为 0 的分类不进分面栏(点了也是空),由展示层在取数前剪掉。
 */
export type ShopFacetTreeProps = {
  nodes: CategoryNode[];
  selectedSlugs: string[];
  query: ShopQuery;
  /** 初始展开的分类 id(选中项自身 + 其祖先链) */
  defaultExpanded: string[];
};

export function ShopFacetTree({
  nodes,
  selectedSlugs,
  query,
  defaultExpanded,
}: ShopFacetTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="space-y-0.5">
      {nodes.map((node, index) => (
        <FacetBranch
          key={node.id}
          node={node}
          accent={SHOP_CATEGORY_ACCENTS[index % SHOP_CATEGORY_ACCENTS.length] ?? "#f2ca72"}
          selectedSlugs={selectedSlugs}
          query={query}
          expanded={expanded}
          onToggle={toggle}
        />
      ))}
    </ul>
  );
}

function FacetBranch({
  node,
  accent,
  selectedSlugs,
  query,
  expanded,
  onToggle,
}: {
  node: CategoryNode;
  accent: string;
  selectedSlugs: string[];
  query: ShopQuery;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedSlugs.includes(node.slug);
  const nextSlugs = isSelected
    ? selectedSlugs.filter((s) => s !== node.slug)
    : [...selectedSlugs, node.slug];
  const href = buildShopHref(query, { categorySlugs: nextSlugs, page: 1 });

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-lg border px-1.5 py-1 transition-colors ${
          isSelected
            ? "border-link/45 bg-link/15 text-foreground"
            : "border-transparent text-body hover:bg-panel-hover hover:text-heading"
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "收起" : "展开"}「${node.name}」`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-link"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        <Link
          href={href}
          aria-current={isSelected ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}66` }}
          />
          <span className="truncate text-[13.5px]">{node.name}</span>
        </Link>

        <span className="shrink-0 text-[11.5px] tabular-nums text-muted">{node.subtreeCount}</span>
      </div>

      {hasChildren && isOpen ? (
        <ul className="ml-2.5 mt-0.5 space-y-0.5 border-l border-line pl-2">
          {node.children.map((child) => (
            <FacetBranch
              key={child.id}
              node={child}
              accent={accent}
              selectedSlugs={selectedSlugs}
              query={query}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
