"use client";

import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { NavIcon, BOARD_ICON_KEYS } from "@/components/admin/nav-icons";
import { Input } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

export type BoardDraft = { slug: string; name: string; description: string; icon: string };

export function ForumBoardEditorFields({
  draft: d,
  setDraft: setD,
}: {
  draft: BoardDraft;
  setDraft: (u: (prev: BoardDraft) => BoardDraft) => void;
}) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
            slug(仅小写字母/数字/连字符)
            <Input
              required
              value={d.slug}
              onChange={(e) => setD((p) => ({ ...p, slug: e.target.value }))}
              placeholder="如 guild-hall"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
            名称
            <Input
              required
              value={d.name}
              onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 text-xs text-[#93b2ce]">
          图标(点击选择,可不留空用默认首字)
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={d.icon === ""}
              onClick={() => setD((p) => ({ ...p, icon: "" }))}
              className={`grid h-9 w-9 place-items-center rounded-lg border text-[13px] transition ${FOCUS_RING} ${
                d.icon === ""
                  ? "border-[#6fb7e0] bg-[#6fb7e0]/15 text-[#a8d9f5]"
                  : "border-[#22385a] text-[#6482a3] hover:border-[#6fb7e0]/40"
              }`}
            >
              无
            </button>
            {BOARD_ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={d.icon === key}
                title={key}
                onClick={() => setD((p) => ({ ...p, icon: key }))}
                className={`grid h-9 w-9 place-items-center rounded-lg border transition [&>svg]:h-4.5 [&>svg]:w-4.5 ${FOCUS_RING} ${
                  d.icon === key
                    ? "border-[#6fb7e0] bg-[#6fb7e0]/15 text-[#a8d9f5]"
                    : "border-[#22385a] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]"
                }`}
              >
                <NavIcon icon={key} className="h-4.5 w-4.5" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs text-[#93b2ce]">
          版块说明(Markdown;列表行内显示纯文本首行,版块页头完整渲染)
          <MarkdownEditor
            value={d.description}
            onChange={(v) => setD((p) => ({ ...p, description: v }))}
            height={280}
            withPreview={false}
          />
        </div>
      </div>
    );
  }

