import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import {
  deleteMediaAsset,
  uploadMediaAssets,
} from "@/server/services/media/library";
import { deleteLocalMedia, readLocalMedia } from "@/lib/media/local-store";

/**
 * COS 未配置时的本地存储回退(2026-11-01 用户报障:
 * 后台渐进「添加阶段→上传配图」无反应,根因 /api/admin/media 500)。
 * 断言上传落 workspace/uploads、URL=/uploads/{cosKey}、内容可读、删除同清。
 */
vi.mock("@/lib/cos/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cos/client")>();
  return {
    ...actual,
    getCosClient: async () => {
      throw new actual.CosNotConfiguredError();
    },
  };
});

const RUN = Date.now().toString(36);
const UPLOADER = BigInt(`96${(Number.parseInt(RUN, 36) % 100000).toString().padStart(5, "0")}`);
const UPLOADER_NAME = `t29media-local-${RUN}`;
const createdKeys: string[] = [];

function pngFile(name: string, content: string) {
  return { name, mimeType: "image/png", bytes: Buffer.from(content) };
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.user.upsert({
    where: { id: UPLOADER },
    update: {},
    create: {
      id: UPLOADER,
      username: UPLOADER_NAME,
      email: `${UPLOADER_NAME}@test.local`,
      passwordHash: "test-hash",
      passwordAlgo: "bcrypt_wp",
    },
  });
});

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { cosKey: { in: createdKeys } } });
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.CONTENT_MEDIA_DELETED, actorUserId: UPLOADER },
  });
  await prisma.user.deleteMany({ where: { id: UPLOADER } });
  for (const key of createdKeys) {
    await deleteLocalMedia(key).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("媒体上传本地回退(COS 未配置)", () => {
  it("落 workspace/uploads,URL=/uploads/{cosKey},内容可读", async () => {
    const content = `local-${RUN}`;
    const [asset] = await uploadMediaAssets([pngFile(`local-${RUN}.png`, content)], UPLOADER);
    if (!asset) throw new Error("upload returned no asset");
    createdKeys.push(asset.cosKey);

    expect(asset.cosKey).toMatch(/^media\/\d{8}\/[0-9a-f]{64}\.png$/);
    expect(asset.url).toBe(`/uploads/${asset.cosKey}`);

    const file = await readLocalMedia(asset.cosKey);
    expect(file?.mimeType).toBe("image/png");
    expect(file?.bytes.toString()).toBe(content);

    const row = await prisma.mediaAsset.findUnique({ where: { cosKey: asset.cosKey } });
    expect(row?.url).toBe(asset.url);
  });

  it("同内容二次上传复用资产行(不重复落盘)", async () => {
    const content = `again-${RUN}`;
    const [first] = await uploadMediaAssets([pngFile(`again-${RUN}.png`, content)], UPLOADER);
    const [second] = await uploadMediaAssets([pngFile(`renamed-${RUN}.png`, content)], UPLOADER);
    if (!first || !second) throw new Error("upload returned no asset");
    createdKeys.push(first.cosKey);
    expect(second.id).toBe(first.id);
    expect(second.cosKey).toBe(first.cosKey);
  });

  it("删除本地资产:文件与行同清 + 审计", async () => {
    const [asset] = await uploadMediaAssets(
      [pngFile(`gone-${RUN}.png`, `gone-${RUN}`)],
      UPLOADER,
    );
    if (!asset) throw new Error("upload returned no asset");
    createdKeys.push(asset.cosKey);

    await deleteMediaAsset(BigInt(asset.id), UPLOADER);
    await expect(readLocalMedia(asset.cosKey)).resolves.toBeNull();
    await expect(
      prisma.mediaAsset.findUnique({ where: { cosKey: asset.cosKey } }),
    ).resolves.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.CONTENT_MEDIA_DELETED, actorUserId: UPLOADER },
      orderBy: { id: "desc" },
    });
    expect((audit.payloadJson as { cosKey?: string }).cosKey).toBe(asset.cosKey);
  });
});
