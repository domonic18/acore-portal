import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { reloadSystemConfig, getConfig } from "@/lib/config";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup as saveGroup } from "@/server/services/settings/save";

/**
 * 通道类配置组集成(app / soap / gamedb):
 * 只写不读的口令不回显、连接串回显脱敏、提交脱敏形态即未改、
 * 口令位仍是 *** 时用现值回填(管理员只改 host 不会把 *** 写进库)。
 * system_config 共享键:用前快照、用后还原。
 */

const ADMIN_ID = 3n;

const APP_KEYS = ["app.url"];
const SOAP_KEYS = ["soap.url", "soap.user", "soap.password", "soap.realm"];
const GAMEDB_KEYS = [
  "gamedb.auth",
  "gamedb.characters",
  "gamedb.world",
  "gamedb.eluna",
];
const ALL_KEYS = [...APP_KEYS, ...SOAP_KEYS, ...GAMEDB_KEYS];

let backup: { key: string; value: string }[] = [];

beforeAll(async () => {
  backup = await prisma.systemConfig.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, value: true },
  });
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: ALL_KEYS } } });
  if (backup.length > 0) {
    await prisma.systemConfig.createMany({ data: backup });
  }
  await reloadSystemConfig();
});

describe("app 组(站点地址)", () => {
  it("保存 → 落库热生效;非法 URL 422 零写入", async () => {
    const original = (await getConfig()).app.url;
    const ok = await saveGroup("app", { url: "https://portal.example.test" }, { id: ADMIN_ID });
    expect(ok).toEqual({ ok: true });
    expect((await getConfig()).app.url).toBe("https://portal.example.test");

    const bad = await saveGroup("app", { url: "not-a-url" }, { id: ADMIN_ID });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    // 零写入:非法提交不动现值
    expect((await getConfig()).app.url).toBe("https://portal.example.test");

    await saveGroup("app", { url: original }, { id: ADMIN_ID });
  });
});

describe("soap 组(世界服通道)", () => {
  it("口令只写不读:空提交=保持;非空=覆写;视图不回显明文", async () => {
    const original = await getConfig();
    const result = await saveGroup(
      "soap",
      {
        url: original.soap.url,
        user: original.soap.user,
        password: "soap-secret-rotated",
        realm: original.soap.realm,
      },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).soap.password).toBe("soap-secret-rotated");

    // 空口令 = 保持原值(不落空串覆盖)
    await saveGroup(
      "soap",
      {
        url: original.soap.url,
        user: original.soap.user,
        password: "",
        realm: original.soap.realm,
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).soap.password).toBe("soap-secret-rotated");

    const view = await getSettingsView();
    expect(view.soap.passwordConfigured).toBe(true);
    expect(JSON.stringify(view)).not.toContain("soap-secret-rotated");

    await saveGroup(
      "soap",
      {
        url: original.soap.url,
        user: original.soap.user,
        password: original.soap.password,
        realm: original.soap.realm,
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).soap.password).toBe(original.soap.password);
  });

  it("账号留空 422 零写入", async () => {
    const before = (await getConfig()).soap.user;
    const bad = await saveGroup(
      "soap",
      { url: "http://localhost:17878/", user: "", password: "", realm: "Dev" },
      { id: ADMIN_ID },
    );
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((await getConfig()).soap.user).toBe(before);
  });
});

describe("gamedb 组(游戏四库连接串)", () => {
  it("视图回脱敏串,不含明文口令", async () => {
    const view = await getSettingsView();
    const dumped = JSON.stringify(view.gamedb);
    const real = (await getConfig()).gamedb;
    for (const url of Object.values(real)) {
      const password = new URL(url).password;
      if (password) expect(dumped).not.toContain(password);
    }
    expect(view.gamedb.auth).toContain("***");
  });

  it("提交脱敏形态 = 未改(口令不被 *** 覆盖)", async () => {
    const before = await getConfig();
    const view = await getSettingsView();
    const result = await saveGroup(
      "gamedb",
      {
        auth: view.gamedb.auth,
        characters: view.gamedb.characters,
        world: view.gamedb.world,
        eluna: view.gamedb.eluna,
      },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    const after = await getConfig();
    expect(after.gamedb).toEqual(before.gamedb);
  });

  it("只改 host、口令位仍是 *** → 口令用现值回填", async () => {
    const before = await getConfig();
    const masked = (await getSettingsView()).gamedb.characters;
    // 只改 host,口令位仍是 *** —— 换 host 不该把 *** 写进库
    const edited = masked.replace(/@[^/]+/, "@127.0.0.1:3307");
    expect(edited).not.toBe(masked);
    const result = await saveGroup(
      "gamedb",
      {
        auth: before.gamedb.auth,
        characters: edited,
        world: before.gamedb.world,
        eluna: before.gamedb.eluna,
      },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    const after = await getConfig();
    expect(new URL(after.gamedb.characters).password).toBe(
      new URL(before.gamedb.characters).password,
    );
    expect(after.gamedb.characters).toContain("@127.0.0.1:3307");

    // 还原
    await saveGroup(
      "gamedb",
      {
        auth: before.gamedb.auth,
        characters: before.gamedb.characters,
        world: before.gamedb.world,
        eluna: before.gamedb.eluna,
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).gamedb).toEqual(before.gamedb);
  });
});
