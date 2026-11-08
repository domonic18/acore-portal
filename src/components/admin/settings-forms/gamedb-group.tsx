"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, useGroupSave } from "./common";

type Target = "auth" | "characters" | "world" | "eluna";

const TARGETS: Array<{ key: Target; label: string }> = [
  { key: "auth", label: "认证库(auth)" },
  { key: "characters", label: "角色库(characters)" },
  { key: "world", label: "世界库(world)" },
  { key: "eluna", label: "脚本库(eluna)" },
];

type ProbeState = { busy: boolean; result: { ok: boolean; text: string } | null };

export function GameDbGroup({ view }: { view: SettingsView["gamedb"] }) {
  const [values, setValues] = useState<Record<Target, string>>({
    auth: view.auth,
    characters: view.characters,
    world: view.world,
    eluna: view.eluna,
  });
  const { busy, saved, error, save } = useGroupSave();
  const [probes, setProbes] = useState<Record<Target, ProbeState>>({
    auth: { busy: false, result: null },
    characters: { busy: false, result: null },
    world: { busy: false, result: null },
    eluna: { busy: false, result: null },
  });

  /** 用当前表单里的候选连接串测连通(不落库);口令位若仍是 *** 则用现值回填 */
  async function testConnection(target: Target) {
    setProbes((p) => ({ ...p, [target]: { busy: true, result: null } }));
    try {
      const body = await requestJson<{ ok?: boolean; message?: string }>(
        "/api/admin/settings/test/gamedb",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target, url: values[target] }),
        },
      );
      setProbes((p) => ({
        ...p,
        [target]: {
          busy: false,
          result: { ok: !!body.ok, text: body.ok ? (body.message ?? "连通") : (body.message ?? "连接失败") },
        },
      }));
    } catch (err) {
      setProbes((p) => ({
        ...p,
        [target]: { busy: false, result: { ok: false, text: errorMessage(err) } },
      }));
    }
  }

  return (
    <GroupSection
      name="gamedb"
      title="游戏四库"
      description="AzerothCore 四库连接串;口令以 *** 脱敏回显——只改 host/库名时口令自动沿用,换口令才需要整串重填;保存后免重启换库"
    >
      {TARGETS.map(({ key, label }) => {
        const probe = probes[key];
        return (
          <div key={key} className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
              <span className="w-56 shrink-0 text-[#93b2ce]">{label}</span>
              <Input
                data-testid={`settings-field-gamedb-${key}`}
                type="text"
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className="w-64 py-1"
              />
              <Button
                data-testid={`settings-test-gamedb-${key}`}
                type="button"
                variant="secondary"
                disabled={probe.busy || values[key] === ""}
                onClick={() => {
                  void testConnection(key);
                }}
              >
                {probe.busy ? "测试中…" : "测试连接"}
              </Button>
            </label>
            {probe.result ? (
              <span
                data-testid={`settings-test-gamedb-${key}-result`}
                className={`ml-56 text-sm ${probe.result.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
              >
                {probe.result.text}
              </span>
            ) : null}
          </div>
        );
      })}
      <SaveBar
        group="gamedb"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => {
          void save("gamedb", {
            auth: values.auth,
            characters: values.characters,
            world: values.world,
            eluna: values.eluna,
          });
        }}
      />
    </GroupSection>
  );
}
