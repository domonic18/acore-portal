"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SIDEBAR_COMPONENT_KEYS,
  type SidebarComponentKey,
  type SitePageType,
} from "@/constants/content";
import {
  SIDEBAR_COMPONENT_META,
  SIDEBAR_LIMITS,
  type SidebarCardConfig,
  type SidebarLinkConfig,
} from "@/constants/sidebar";
import { Button } from "@/components/ui/button";
import { errorMessage, requestJson } from "@/lib/api-client";
import { PageChips, SidebarCardRow } from "./sidebar-card-editor";

/**
 * 侧栏编辑器(2026-11-10 UX 重构):按前台实际结构组织——
 * 上方「自定义快捷卡」(可增删改排序,折叠行+展开编辑,见 sidebar-card-editor),
 * 下方「内置组件」(系统功能卡,只配页面范围);一次 PUT /api/admin/sidebar。
 */

type DraftCard = SidebarCardConfig;
type ComponentPages = Record<SidebarComponentKey, SitePageType[]>;

function newKey() {
  return `custom-${Date.now().toString(36)}`;
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function touch() {
    setSaved(false);
    setDirty(true);
  }

  function updateCard(index: number, patch: Partial<DraftCard>) {
    touch();
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  function moveCard(index: number, delta: number) {
    touch();
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
    touch();
    if (cards[index]?.key === expandedKey) setExpandedKey(null);
    setCards((prev) => prev.filter((_, i) => i !== index));
  }

  function addCard() {
    if (cards.length >= SIDEBAR_LIMITS.cards) return;
    touch();
    const key = newKey();
    setCards((prev) => [
      ...prev,
      {
        key,
        title: "",
        pages: ["page"],
        body: "",
        links: [{ label: "", href: "", note: "" }],
      },
    ]);
    setExpandedKey(key);
  }

  function updateLink(cardIndex: number, linkIndex: number, patch: Partial<SidebarLinkConfig>) {
    touch();
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
    touch();
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex && card.links.length < SIDEBAR_LIMITS.linksPerCard
          ? { ...card, links: [...card.links, { label: "", href: "", note: "" }] }
          : card,
      ),
    );
  }

  function removeLink(cardIndex: number, linkIndex: number) {
    touch();
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex
          ? { ...card, links: card.links.filter((_, j) => j !== linkIndex) }
          : card,
      ),
    );
  }

  function togglePage(index: number, page: SitePageType, on: boolean) {
    const card = cards[index];
    if (!card) return;
    const pages = on
      ? [...card.pages, page]
      : card.pages.filter((item) => item !== page);
    updateCard(index, { pages });
  }

  function toggleComponentPage(key: SidebarComponentKey, page: SitePageType, on: boolean) {
    touch();
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
      setDirty(false);
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
          {busy ? "保存中…" : "保存全部"}
        </Button>
        {saved && !dirty ? (
          <span data-testid="sidebar-save-result" className="text-sm text-[#6ee7b7]">
            已保存,即时生效
          </span>
        ) : null}
        {dirty ? <span className="text-sm text-[#e8c877]">有未保存的修改</span> : null}
        {error ? (
          <span data-testid="sidebar-error" role="alert" className="text-sm text-[#eda9a9]">
            {error}
          </span>
        ) : null}
      </div>

      <section
        data-testid="sidebar-cards-section"
        className="flex flex-col gap-2 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
      >
        <div>
          <h2 className="font-semibold text-[#dcebf7]">自定义快捷卡</h2>
          <p className="text-xs text-[#6482a3]">
            显示在前台侧栏上方,按下列顺序;点击「编辑」修改标题、说明与链接,空白链接行保存时自动忽略。
          </p>
        </div>
        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-8 text-center text-[#6482a3]">
            暂无快捷卡;点击「添加快捷卡」创建(如:客户端下载、YY 频道)。
          </p>
        ) : (
          <div className="flex flex-col">
            {cards.map((card, index) => (
              <SidebarCardRow
                key={card.key}
                card={card}
                index={index}
                total={cards.length}
                expanded={expandedKey === card.key}
                busy={busy}
                onToggleExpand={() =>
                  setExpandedKey((prev) => (prev === card.key ? null : card.key))
                }
                onPatch={(patch) => updateCard(index, patch)}
                onMove={(delta) => moveCard(index, delta)}
                onRemove={() => removeCard(index)}
                onPatchLink={(linkIndex, patch) => updateLink(index, linkIndex, patch)}
                onAddLink={() => addLink(index)}
                onRemoveLink={(linkIndex) => removeLink(index, linkIndex)}
                onTogglePage={(page, on) => togglePage(index, page, on)}
              />
            ))}
          </div>
        )}
      </section>

      <section
        data-testid="sidebar-components-section"
        className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
      >
        <div>
          <h2 className="font-semibold text-[#dcebf7]">内置组件</h2>
          <p className="text-xs text-[#6482a3]">
            系统功能卡,显示在前台侧栏下方、快捷卡之后;内容由系统自动生成、不可编辑,只选择在哪些页面显示(全部取消 = 全站隐藏)。
          </p>
        </div>
        {SIDEBAR_COMPONENT_KEYS.map((key) => (
          <div
            key={key}
            data-testid={`sidebar-comp-${key}`}
            className="flex flex-wrap items-center gap-3 border-t border-[#1b2f4d] pt-3 first:border-t-0 first:pt-0"
          >
            <span className="rounded bg-[#6fb7e0]/15 px-1.5 py-0.5 text-[11px] text-[#a8d9f5]">
              内置
            </span>
            <div className="w-44 shrink-0">
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
    </section>
  );
}
