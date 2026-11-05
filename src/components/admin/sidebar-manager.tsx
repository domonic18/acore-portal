"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SIDEBAR_COMPONENT_KEYS,
  SITE_PAGE_TYPES,
  type SidebarComponentKey,
  type SitePageType,
} from "@/constants/content";
import {
  SIDEBAR_COMPONENT_META,
  SIDEBAR_LIMITS,
  SIDEBAR_PAGE_LABELS,
  type SidebarCardConfig,
  type SidebarLinkConfig,
} from "@/constants/sidebar";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { Input } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 侧栏编辑器(M4 通用化):内置组件页面范围 + 快捷卡整树,一次 PUT /api/admin/sidebar。
 * 卡片/链接按数组顺序渲染;完全空白的链接行保存时自动忽略;
 * 内置组件清单来自代码注册表(不可增删),仅配置各页面范围(可全取消=全站隐藏)。
 */

type DraftCard = SidebarCardConfig;
type DraftLink = SidebarLinkConfig;
type ComponentPages = Record<SidebarComponentKey, SitePageType[]>;

function newKey() {
  return `custom-${Date.now().toString(36)}`;
}

function PageChips({
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
      页面范围
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

export function SidebarManager({
  cards: initialCards,
  components: initialComponents,
}: {
  cards: SidebarCardConfig[];
  components: ComponentPages;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<DraftCard[]>(() =>
    initialCards.map((card) => ({ ...card, links: card.links.map((link) => ({ ...link })) })),
  );
  const [components, setComponents] = useState<ComponentPages>(() => ({
    ...initialComponents,
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCard(index: number, patch: Partial<DraftCard>) {
    setSaved(false);
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  function moveCard(index: number, delta: number) {
    setSaved(false);
    setCards((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const current = next[index]!;
      next[index] = next[target]!;
      next[target] = current;
      return next;
    });
  }

  function removeCard(index: number) {
    setSaved(false);
    setCards((prev) => prev.filter((_, i) => i !== index));
  }

  function addCard() {
    if (cards.length >= SIDEBAR_LIMITS.cards) return;
    setSaved(false);
    setCards((prev) => [
      ...prev,
      {
        key: newKey(),
        title: "",
        pages: ["page"],
        body: "",
        links: [{ label: "", href: "", note: "" }],
      },
    ]);
  }

  function updateLink(cardIndex: number, linkIndex: number, patch: Partial<DraftLink>) {
    setSaved(false);
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex
          ? {
              ...card,
              links: card.links.map((link, j) => (j === linkIndex ? { ...link, ...patch } : link)),
            }
          : card,
      ),
    );
  }

  function addLink(cardIndex: number) {
    setSaved(false);
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex && card.links.length < SIDEBAR_LIMITS.linksPerCard
          ? { ...card, links: [...card.links, { label: "", href: "", note: "" }] }
          : card,
      ),
    );
  }

  function removeLink(cardIndex: number, linkIndex: number) {
    setSaved(false);
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex
          ? { ...card, links: card.links.filter((_, j) => j !== linkIndex) }
          : card,
      ),
    );
  }

  function togglePage(index: number, page: (typeof SITE_PAGE_TYPES)[number], on: boolean) {
    const card = cards[index];
    if (!card) return;
    const pages = on
      ? [...card.pages, page]
      : card.pages.filter((item) => item !== page);
    updateCard(index, { pages });
  }

  function toggleComponentPage(key: SidebarComponentKey, page: SitePageType, on: boolean) {
    setSaved(false);
    setComponents((prev) => ({
      ...prev,
      [key]: on ? [...prev[key], page] : prev[key].filter((item) => item !== page),
    }));
  }

  function normalize(card: DraftCard): DraftCard {
    return {
      key: card.key,
      title: card.title.trim(),
      pages: card.pages,
      body: card.body?.trim() || undefined,
      links: card.links
        .filter((link) => link.label.trim() !== "" || link.href.trim() !== "")
        .map((link) => ({
          label: link.label.trim(),
          href: link.href.trim(),
          note: link.note?.trim() || undefined,
        })),
    };
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await requestJson("/api/admin/sidebar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cards: cards.map(normalize),
          components: SIDEBAR_COMPONENT_KEYS.map((key) => ({
            key,
            pages: components[key],
          })),
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="admin-sidebar-manager" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          data-testid="sidebar-add-card"
          disabled={busy || cards.length >= SIDEBAR_LIMITS.cards}
          onClick={addCard}
        >
          添加快捷卡
        </Button>
        <Button
          type="button"
          variant="primary"
          data-testid="sidebar-save"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
        {saved ? (
          <span data-testid="sidebar-save-result" className="text-sm text-[#6ee7b7]">
            已保存,即时生效
          </span>
        ) : null}
        {error ? (
          <span data-testid="sidebar-error" role="alert" className="text-sm text-[#eda9a9]">
            {error}
          </span>
        ) : null}
        <span className="text-xs text-[#6482a3]">
          空白链接行保存时忽略;卡片按列表顺序展示,链接留空文案无法保存。
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-8 text-center text-[#6482a3]">
          暂无侧栏快捷卡;点击「添加快捷卡」创建。
        </p>
      ) : null}

      <section
        data-testid="sidebar-components-section"
        className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
      >
        <div>
          <h2 className="font-semibold text-[#dcebf7]">内置组件</h2>
          <p className="text-xs text-[#6482a3]">
            站点自带功能卡,选择在哪些页面展示(可全部取消=全站隐藏);顺序固定,内容由系统提供。
          </p>
        </div>
        {SIDEBAR_COMPONENT_KEYS.map((key) => (
          <div
            key={key}
            data-testid={`sidebar-comp-${key}`}
            className="flex flex-wrap items-center gap-3 border-t border-[#1b2f4d] pt-3 first:border-t-0 first:pt-0"
          >
            <div className="w-40 shrink-0">
              <span className="text-sm text-[#dcebf7]">{SIDEBAR_COMPONENT_META[key].label}</span>
              <p className="text-xs text-[#6482a3]">{SIDEBAR_COMPONENT_META[key].description}</p>
            </div>
            <PageChips
              idPrefix={`sidebar-comp-${key}`}
              pages={components[key]}
              onToggle={(page, on) => toggleComponentPage(key, page, on)}
            />
          </div>
        ))}
      </section>

      {cards.map((card, index) => (
        <div
          key={card.key}
          data-testid={`sidebar-card-${card.key}`}
          className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
              标题
              <Input
                data-testid={`sidebar-card-${card.key}-title`}
                value={card.title}
                maxLength={SIDEBAR_LIMITS.title}
                onChange={(e) => updateCard(index, { title: e.target.value })}
                className="w-44 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
              正文(可选,无链接卡必填)
              <Input
                data-testid={`sidebar-card-${card.key}-body`}
                value={card.body ?? ""}
                maxLength={SIDEBAR_LIMITS.body}
                onChange={(e) => updateCard(index, { body: e.target.value })}
                placeholder="如:频道号见公告"
                className="w-64 py-1"
              />
            </label>
            <PageChips
              idPrefix={`sidebar-card-${card.key}`}
              pages={card.pages}
              onToggle={(page, on) => togglePage(index, page, on)}
            />
            <span className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid={`sidebar-move-card-${card.key}-up`}
                disabled={busy || index === 0}
                onClick={() => moveCard(index, -1)}
              >
                上移
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid={`sidebar-move-card-${card.key}-down`}
                disabled={busy || index === cards.length - 1}
                onClick={() => moveCard(index, 1)}
              >
                下移
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                data-testid={`sidebar-remove-card-${card.key}`}
                disabled={busy}
                onClick={() => removeCard(index)}
              >
                删除卡
              </Button>
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {card.links.map((link, linkIndex) => (
              <div key={linkIndex} className="flex flex-wrap items-center gap-2">
                <Input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-label`}
                  value={link.label}
                  maxLength={SIDEBAR_LIMITS.label}
                  onChange={(e) => updateLink(index, linkIndex, { label: e.target.value })}
                  placeholder="链接文案"
                  className="w-40 py-1"
                />
                <Input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-href`}
                  value={link.href}
                  maxLength={SIDEBAR_LIMITS.href}
                  onChange={(e) => updateLink(index, linkIndex, { href: e.target.value })}
                  placeholder="/tutorial#patch_download 或 https://…"
                  className="w-80 py-1"
                />
                <Input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-note`}
                  value={link.note ?? ""}
                  maxLength={SIDEBAR_LIMITS.note}
                  onChange={(e) => updateLink(index, linkIndex, { note: e.target.value })}
                  placeholder="备注(可选)"
                  className="w-40 py-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`sidebar-remove-link-${card.key}-${linkIndex}`}
                  disabled={busy}
                  onClick={() => removeLink(index, linkIndex)}
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
              onClick={() => addLink(index)}
            >
              添加链接
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
