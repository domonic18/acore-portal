"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_PAGE_TYPES } from "@/constants/content";
import {
  SIDEBAR_LIMITS,
  SIDEBAR_PAGE_LABELS,
  type SidebarCardConfig,
  type SidebarLinkConfig,
} from "@/constants/sidebar";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 侧栏快捷卡编辑器(M4 通用化):整树本地编辑 → 一次 PUT /api/admin/sidebar。
 * 卡片/链接按数组顺序渲染;完全空白的链接行保存时自动忽略。
 */

type DraftCard = SidebarCardConfig;
type DraftLink = SidebarLinkConfig;

const inputCls =
  "rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white placeholder:text-gray-600";

function newKey() {
  return `custom-${Date.now().toString(36)}`;
}

export function SidebarManager({ cards: initial }: { cards: SidebarCardConfig[] }) {
  const router = useRouter();
  const [cards, setCards] = useState<DraftCard[]>(() =>
    initial.map((card) => ({ ...card, links: card.links.map((link) => ({ ...link })) })),
  );
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
        body: JSON.stringify({ cards: cards.map(normalize) }),
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
        <button
          type="button"
          data-testid="sidebar-add-card"
          disabled={busy || cards.length >= SIDEBAR_LIMITS.cards}
          onClick={addCard}
          className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-400 disabled:opacity-50"
        >
          添加快捷卡
        </button>
        <button
          type="button"
          data-testid="sidebar-save"
          disabled={busy}
          onClick={() => void save()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        {saved ? (
          <span data-testid="sidebar-save-result" className="text-sm text-green-400">
            已保存,即时生效
          </span>
        ) : null}
        {error ? (
          <span data-testid="sidebar-error" role="alert" className="text-sm text-red-400">
            {error}
          </span>
        ) : null}
        <span className="text-xs text-gray-500">
          空白链接行保存时忽略;卡片按列表顺序展示,链接留空文案无法保存。
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-8 text-center text-gray-400">
          暂无侧栏快捷卡;点击「添加快捷卡」创建。
        </p>
      ) : null}

      {cards.map((card, index) => (
        <div
          key={card.key}
          data-testid={`sidebar-card-${card.key}`}
          className="flex flex-col gap-3 rounded border border-gray-800 p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-300">
              标题
              <input
                data-testid={`sidebar-card-${card.key}-title`}
                value={card.title}
                maxLength={SIDEBAR_LIMITS.title}
                onChange={(e) => updateCard(index, { title: e.target.value })}
                className={`${inputCls} w-44`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-300">
              正文(可选,无链接卡必填)
              <input
                data-testid={`sidebar-card-${card.key}-body`}
                value={card.body ?? ""}
                maxLength={SIDEBAR_LIMITS.body}
                onChange={(e) => updateCard(index, { body: e.target.value })}
                placeholder="如:频道号见公告"
                className={`${inputCls} w-64`}
              />
            </label>
            <span className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
              页面范围
              {SITE_PAGE_TYPES.map((page) => (
                <label key={page} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    data-testid={`sidebar-card-${card.key}-page-${page}`}
                    checked={card.pages.includes(page)}
                    onChange={(e) => togglePage(index, page, e.target.checked)}
                  />
                  {SIDEBAR_PAGE_LABELS[page]}
                </label>
              ))}
            </span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                data-testid={`sidebar-move-card-${card.key}-up`}
                disabled={busy || index === 0}
                onClick={() => moveCard(index, -1)}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400 disabled:opacity-40"
              >
                上移
              </button>
              <button
                type="button"
                data-testid={`sidebar-move-card-${card.key}-down`}
                disabled={busy || index === cards.length - 1}
                onClick={() => moveCard(index, 1)}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400 disabled:opacity-40"
              >
                下移
              </button>
              <button
                type="button"
                data-testid={`sidebar-remove-card-${card.key}`}
                disabled={busy}
                onClick={() => removeCard(index)}
                className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-40"
              >
                删除卡
              </button>
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {card.links.map((link, linkIndex) => (
              <div key={linkIndex} className="flex flex-wrap items-center gap-2">
                <input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-label`}
                  value={link.label}
                  maxLength={SIDEBAR_LIMITS.label}
                  onChange={(e) => updateLink(index, linkIndex, { label: e.target.value })}
                  placeholder="链接文案"
                  className={`${inputCls} w-40`}
                />
                <input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-href`}
                  value={link.href}
                  maxLength={SIDEBAR_LIMITS.href}
                  onChange={(e) => updateLink(index, linkIndex, { href: e.target.value })}
                  placeholder="/tutorial#patch_download 或 https://…"
                  className={`${inputCls} w-80`}
                />
                <input
                  data-testid={`sidebar-card-${card.key}-link-${linkIndex}-note`}
                  value={link.note ?? ""}
                  maxLength={SIDEBAR_LIMITS.note}
                  onChange={(e) => updateLink(index, linkIndex, { note: e.target.value })}
                  placeholder="备注(可选)"
                  className={`${inputCls} w-40`}
                />
                <button
                  type="button"
                  data-testid={`sidebar-remove-link-${card.key}-${linkIndex}`}
                  disabled={busy}
                  onClick={() => removeLink(index, linkIndex)}
                  className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400 disabled:opacity-40"
                >
                  删除链接
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid={`sidebar-add-link-${card.key}`}
              disabled={busy || card.links.length >= SIDEBAR_LIMITS.linksPerCard}
              onClick={() => addLink(index)}
              className="w-fit rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400 disabled:opacity-40"
            >
              添加链接
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
