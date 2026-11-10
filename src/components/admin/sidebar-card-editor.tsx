"use client";

import { SITE_PAGE_TYPES, type SitePageType } from "@/constants/content";
import {
  SIDEBAR_LIMITS,
  SIDEBAR_PAGE_LABELS,
  type SidebarCardConfig,
  type SidebarLinkConfig,
} from "@/constants/sidebar";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { Input } from "@/components/ui/input";

/**
 * 侧栏快捷卡编辑器(2026-11-10 UX 重构):折叠行列表 + 展开式结构化编辑
 * + 前台同款实时预览。预览样式类直接复用前台侧栏卡(quick-cards/card),零漂移。
 */

/** 页面范围多选 chip(快捷卡编辑器与内置组件行共用) */
export function PageChips({
  idPrefix,
  pages,
  onToggle,
}: {
  idPrefix: string;
  pages: SitePageType[];
  onToggle: (page: SitePageType, on: boolean) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-[#93b2ce]">
      {SITE_PAGE_TYPES.map((page) => (
        <label
          key={page}
          className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] transition ${FOCUS_RING} ${
            pages.includes(page)
              ? "border-[#6fb7e0] bg-[#6fb7e0]/15 text-[#a8d9f5]"
              : "border-[#22385a] bg-[#0b1526] text-[#93b2ce] hover:border-[#6fb7e0]/40"
          }`}
        >
          <input
            type="checkbox"
            data-testid={`${idPrefix}-page-${page}`}
            checked={pages.includes(page)}
            onChange={(e) => onToggle(page, e.target.checked)}
            className="sr-only"
          />
          {SIDEBAR_PAGE_LABELS[page]}
        </label>
      ))}
    </span>
  );
}

function CardPreview({ card }: { card: SidebarCardConfig }) {
  const links = card.links.filter((link) => link.label.trim() !== "" || link.href.trim() !== "");
  const body = card.body?.trim();
  return (
    <aside
      data-testid={`sidebar-card-${card.key}-preview`}
      className="w-64 shrink-0 self-start rounded-xl bg-[#081120] p-4"
    >
      <p className="mb-3 text-xs text-[#6482a3]">前台效果预览</p>
      <div className="rounded-xl border border-line bg-panel p-5">
        <h3 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-num">
          <span aria-hidden="true" className="h-[15px] w-[5px] shrink-0 rounded-full bg-accent" />
          {card.title.trim() || <span className="text-[#6482a3]">卡片标题</span>}
        </h3>
        <div className="space-y-2">
          {body ? <p className="text-xs text-muted">{body}</p> : null}
          {links.map((link, index) => (
            <span
              key={`${link.href}-${index}`}
              className="block rounded bg-surface px-3 py-2 text-center text-xs text-foreground"
            >
              {link.label.trim() ? (
                link.note?.trim() ? (
                  `${link.label} · ${link.note}`
                ) : (
                  link.label
                )
              ) : (
                <span className="text-[#6482a3]">链接文字</span>
              )}
            </span>
          ))}
          {links.length === 0 && !body ? (
            <p className="text-xs text-[#6482a3]">空卡:请添加链接或填写卡片说明</p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[#6482a3]">
        实际是否显示由「显示页面」决定;前台按卡片列表顺序展示。
      </p>
    </aside>
  );
}

export function SidebarCardRow({
  card,
  index,
  total,
  expanded,
  busy,
  onToggleExpand,
  onPatch,
  onMove,
  onRemove,
  onPatchLink,
  onAddLink,
  onRemoveLink,
  onTogglePage,
}: {
  card: SidebarCardConfig;
  index: number;
  total: number;
  expanded: boolean;
  busy: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<SidebarCardConfig>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onPatchLink: (linkIndex: number, patch: Partial<SidebarLinkConfig>) => void;
  onAddLink: () => void;
  onRemoveLink: (linkIndex: number) => void;
  onTogglePage: (page: SitePageType, on: boolean) => void;
}) {
  const displayName = card.title.trim() || "未命名";
  const filledLinks = card.links.filter(
    (link) => link.label.trim() !== "" || link.href.trim() !== "",
  ).length;
  const summary = filledLinks > 0 ? `${filledLinks} 个链接` : card.body?.trim() ? "纯文字卡" : "空卡";

  return (
    <div
      data-testid={`sidebar-card-${card.key}`}
      className="flex flex-col border-t border-[#1b2f4d] py-1 first:border-t-0"
    >
      <div className="flex flex-wrap items-center gap-3 py-2">
        <span className="w-5 shrink-0 text-right text-xs text-[#6482a3]">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#dcebf7]">
            {card.title.trim() || <span className="text-[#6482a3]">(未命名卡片)</span>}
          </p>
          <p className="text-xs text-[#6482a3]">
            {summary}
            {card.pages.length > 0
              ? ` · ${card.pages.map((p) => SIDEBAR_PAGE_LABELS[p]).join("/")}`
              : " · 未选页面(前台不显示)"}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          data-testid={`sidebar-card-${card.key}-toggle`}
          disabled={busy}
          onClick={onToggleExpand}
        >
          {expanded ? "收起" : "编辑"}
        </Button>
        <span className="flex gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid={`sidebar-move-card-${card.key}-up`}
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
          >
            上移「{displayName}」
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid={`sidebar-move-card-${card.key}-down`}
            disabled={busy || index === total - 1}
            onClick={() => onMove(1)}
          >
            下移「{displayName}」
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            data-testid={`sidebar-remove-card-${card.key}`}
            disabled={busy}
            onClick={onRemove}
          >
            删除卡
          </Button>
        </span>
      </div>

      {expanded ? (
        <div className="grid gap-5 rounded-xl border border-[#1b2f4d] bg-[#0b1526]/60 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
                卡片标题
                <Input
                  data-testid={`sidebar-card-${card.key}-title`}
                  value={card.title}
                  maxLength={SIDEBAR_LIMITS.title}
                  onChange={(e) => onPatch({ title: e.target.value })}
                  placeholder="如:客户端下载"
                  className="w-44 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
                卡片说明(可选)
                <Input
                  data-testid={`sidebar-card-${card.key}-body`}
                  value={card.body ?? ""}
                  maxLength={SIDEBAR_LIMITS.body}
                  onChange={(e) => onPatch({ body: e.target.value })}
                  placeholder="显示在标题下方,如:频道号见公告"
                  className="w-72 py-1"
                />
                <span className="text-[11px] text-[#6482a3]">无链接的纯文字卡可只填说明</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[#93b2ce]">
                链接(按顺序渲染为按钮)
              </span>
              {card.links.map((link, linkIndex) => (
                <div
                  key={linkIndex}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-[#1b2f4d] bg-[#13233a] p-3"
                >
                  <span className="w-4 pb-2 text-center text-xs text-[#6482a3]">
                    {linkIndex + 1}
                  </span>
                  <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
                    链接文字
                    <Input
                      data-testid={`sidebar-card-${card.key}-link-${linkIndex}-label`}
                      value={link.label}
                      maxLength={SIDEBAR_LIMITS.label}
                      onChange={(e) => onPatchLink(linkIndex, { label: e.target.value })}
                      placeholder="用户看到的按钮文案"
                      className="w-40 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
                    跳转地址
                    <Input
                      data-testid={`sidebar-card-${card.key}-link-${linkIndex}-href`}
                      value={link.href}
                      maxLength={SIDEBAR_LIMITS.href}
                      onChange={(e) => onPatchLink(linkIndex, { href: e.target.value })}
                      placeholder="/tutorial#… 或 https://…"
                      className="w-72 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
                    备注(可选)
                    <Input
                      data-testid={`sidebar-card-${card.key}-link-${linkIndex}-note`}
                      value={link.note ?? ""}
                      maxLength={SIDEBAR_LIMITS.note}
                      onChange={(e) => onPatchLink(linkIndex, { note: e.target.value })}
                      placeholder="跟在文字后,如:1.12 完整客户端"
                      className="w-44 py-1"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    data-testid={`sidebar-remove-link-${card.key}-${linkIndex}`}
                    disabled={busy}
                    onClick={() => onRemoveLink(linkIndex)}
                  >
                    删除链接
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                data-testid={`sidebar-add-link-${card.key}`}
                disabled={busy || card.links.length >= SIDEBAR_LIMITS.linksPerCard}
                onClick={onAddLink}
              >
                添加链接
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-[#93b2ce]">显示页面(哪些页面的右侧栏会出现此卡)</span>
              <PageChips
                idPrefix={`sidebar-card-${card.key}`}
                pages={card.pages}
                onToggle={onTogglePage}
              />
            </div>
          </div>
          <CardPreview card={card} />
        </div>
      ) : null}
    </div>
  );
}
