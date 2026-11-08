import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { reloadSystemConfig, getConfig } from "@/lib/config";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup as saveGroup } from "@/server/services/settings/save";

/**
 * 后台配置组集成(tools / cos / backup):
 * tools 换站只改配置;COS 以桶名为开关、密钥只写不读;
 * backup 保留期与周备份开关落库即被 cron 备份脚本读到。
 * system_config 共享键:用前快照、用后还原。
 */

const ADMIN_ID = 3n;

const TOOLS_KEYS = ["tools.rankBase", "tools.dkpUrl"];
const COS_KEYS = ["cos.bucket", "cos.region", "cos.secretId", "cos.secretKey", "cos.cdnBase"];
const BACKUP_KEYS = ["backup.retentionDays", "backup.gameWeekly"];
const ALL_KEYS = [...TOOLS_KEYS, ...COS_KEYS, ...BACKUP_KEYS];

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

describe("tools 组(外部工具站地址)", () => {
  it("保存 → 落库热生效;非法 URL 422 零写入", async () => {
    const original = (await getConfig()).tools;
    const ok = await saveGroup(
      "tools",
      { rankBase: "https://rank.example.test", dkpUrl: "https://dkp.example.test" },
      { id: ADMIN_ID },
    );
    expect(ok).toEqual({ ok: true });
    expect((await getConfig()).tools).toEqual({
      rankBase: "https://rank.example.test",
      dkpUrl: "https://dkp.example.test",
    });

    const bad = await saveGroup("tools", { rankBase: "not-a-url" }, { id: ADMIN_ID });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    // 零写入:非法提交不动现值
    expect((await getConfig()).tools.rankBase).toBe("https://rank.example.test");

    await saveGroup("tools", { rankBase: original.rankBase, dkpUrl: original.dkpUrl }, { id: ADMIN_ID });
  });
});

describe("cos 组(对象存储)", () => {
  it("桶名为开关:桶名留空=未配置,其余项可留存", async () => {
    await prisma.systemConfig.deleteMany({ where: { key: { in: COS_KEYS } } });
    await reloadSystemConfig();
    expect((await getConfig()).cos).toBeUndefined();

    const result = await saveGroup(
      "cos",
      { bucket: "", region: "", secretId: "", secretKey: "", cdnBase: "" },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).cos).toBeUndefined();
  });

  it("启用(填桶名)须五项齐全,缺项报错且零写入", async () => {
    await prisma.systemConfig.deleteMany({ where: { key: { in: COS_KEYS } } });
    await reloadSystemConfig();

    const bad = await saveGroup("cos", { bucket: "bucket-1250000000" }, { id: ADMIN_ID });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(bad).toHaveProperty("message", expect.stringContaining("region/secretId/secretKey/cdnBase"));
    // 零写入
    const row = await prisma.systemConfig.findFirst({ where: { key: "cos.bucket" } });
    expect(row).toBeNull();
  });

  it("五项齐全 → 落库生效;密钥只写不读(留空=保持现值)", async () => {
    const result = await saveGroup(
      "cos",
      {
        bucket: "bucket-1250000000",
        region: "ap-shanghai",
        secretId: "AKIDtest",
        secretKey: "cos-secret-rotated",
        cdnBase: "https://cdn.example.test",
      },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).cos).toEqual({
      bucket: "bucket-1250000000",
      region: "ap-shanghai",
      secretId: "AKIDtest",
      secretKey: "cos-secret-rotated",
      cdnBase: "https://cdn.example.test",
    });

    // 空密钥提交 = 保持现值(不落空串覆盖)
    await saveGroup(
      "cos",
      {
        bucket: "bucket-1250000000",
        region: "ap-shanghai",
        secretId: "AKIDtest",
        secretKey: "",
        cdnBase: "https://cdn.example.test",
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).cos?.secretKey).toBe("cos-secret-rotated");

    // 视图不回显密钥明文
    const view = await getSettingsView();
    expect(view.cos.configured).toBe(true);
    expect(view.cos.secretKeyConfigured).toBe(true);
    expect(JSON.stringify(view)).not.toContain("cos-secret-rotated");
  });
});

describe("backup 组(备份策略)", () => {
  it("保存 → 落库热生效;负数 422 零写入", async () => {
    const result = await saveGroup(
      "backup",
      { retentionDays: 7, gameWeekly: false },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).backup).toEqual({ retentionDays: 7, gameWeekly: false });

    const bad = await saveGroup("backup", { retentionDays: -1 }, { id: ADMIN_ID });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((await getConfig()).backup?.retentionDays).toBe(7);
  });
});
