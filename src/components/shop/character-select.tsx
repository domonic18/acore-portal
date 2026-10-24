"use client";

import { className, raceName } from "@/constants/characters";

/**
 * T025 角色选择组件(仅本人角色;服务端归属校验在 POST /api/cart 链,
 * 越权 guid 由 403 CHARACTER_NOT_OWNED 拦截并记审计)。
 */
export type CharacterOption = {
  guid: number;
  name: string;
  race: number;
  class: number;
  level: number;
};

export function CharacterSelect({
  characters,
  value,
  onChange,
  disabled,
}: {
  characters: CharacterOption[];
  value: string;
  onChange: (guid: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-300">选择角色</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || characters.length === 0}
        className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
      >
        <option value="">{characters.length === 0 ? "名下暂无角色" : "请选择角色"}</option>
        {characters.map((c) => (
          <option key={c.guid} value={String(c.guid)}>
            {c.name} · {raceName(c.race)} {className(c.class)} · Lv{c.level}
          </option>
        ))}
      </select>
    </label>
  );
}
