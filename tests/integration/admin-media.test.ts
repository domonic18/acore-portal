import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import {
  MediaError,
  deleteMediaAsset,
  listMediaAssets,
  uploadMediaAssets,
} from "@/server/services/media/library";

/**
 * T033 媒体库服务集成(FR-217,api-admin-m3 媒体节):
 * 类型白名单 image/*+pdf 422 TYPE_REJECTED/单文件 10MB 422 TOO_LARGE/
 * cosKey=media/{yyyyMMdd}/{sha256}{ext} 幂等(同内容二次上传零 put,复用资产行)/
 * 列表 20/页+originalName q/删除=删 COS 对象+删行+审计(死链风险由路由层 warning)。
 * COS SDK mock(不真实出网);cdnBase 来自 mock 配置。
 */
const calls = { put: [] as string[], del: [] as string[] };

vi.mock("@/lib/cos/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cos/client")>();
  return {
    ...actual,
    getCosClient: async () => ({
      client: {
        putObject: async (args: { Key: string }) => {
          calls.put.push(args.Key);
          return {};
        },
        deleteObject: async (args: { Key: string }) => {
          calls.del.push(args.Key);
          return {};
        },
      },
      config: {
        bucket: "bucket-x",
        region: "ap-test",
        secretId: "id",
        secretKey: "key",
        cdnBase: "https://cdn.example.com",
      },
    }),
    getCosConfig: actual.getCosConfig,
  };
});

const RUN = Date.now().toString(36);
// fixture 用户 id 由 RUN 派生(MediaAsset.uploaded_by FK;dev 库有存量 Magic id,固定值会撞 PRIMARY)
const UPLOADER = BigInt(`97${(Number.parseInt(RUN, 36) % 100000).toString().padStart(5, "0")}`);
const UPLOADER_NAME = `t29media-${RUN}`;
// hash 幂等按内容寻址:测试内容必须逐次运行唯一,清理按本轮实际产生的 cosKey 清单
const createdKeys: string[] = [];

function fileInput(name: string, mime: string, content: string) {
  return { name, mimeType: mime, bytes: Buffer.from(content) };
}

async function upload(files: Parameters<typeof uploadMediaAssets>[0]) {
  const out = await uploadMediaAssets(files, UPLOADER);
  createdKeys.push(...out.map((a) => a.cosKey));
  return out;
}

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof MediaError) return err.code;
    throw err;
  }
  throw new Error("expected MediaError");
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
  await prisma.$disconnect();
});

describe("媒体上传(T033 FR-217)", () => {
  it("类型白名单:image/*+pdf 放行,txt 拒绝 TYPE_REJECTED", async () => {
    await expect(
      errCode(
        uploadMediaAssets([fileInput(`note-${RUN}.txt`, "text/plain", "x")], UPLOADER),
      ),
    ).resolves.toBe("TYPE_REJECTED");
    const [asset] = await upload([fileInput(`doc-${RUN}.pdf`, "application/pdf", "%PDF-1.4")]);
    if (!asset) throw new Error("upload returned no asset");
    expect(asset.mimeType).toBe("application/pdf");
    expect(asset.url).toBe(`https://cdn.example.com/${asset.cosKey}`);
    expect(asset.cosKey.endsWith(".pdf")).toBe(true);
  });

  it("单文件 >10MB → TOO_LARGE", async () => {
    await expect(
      errCode(
        uploadMediaAssets(
          [
            {
              name: `big-${RUN}.png`,
              mimeType: "image/png",
              bytes: Buffer.alloc(10 * 1024 * 1024 + 1),
            },
          ],
          UPLOADER,
        ),
      ),
    ).resolves.toBe("TOO_LARGE");
  });

  it("cosKey 按 sha256 幂等:同内容二次上传零 put,复用同资产行", async () => {
    calls.put.length = 0; // 前序用例的 put 不入本断言
    const [first] = await upload([
      fileInput(`shot-${RUN}.png`, "image/png", `png-bytes-${RUN}`),
    ]);
    if (!first) throw new Error("upload returned no asset");
    expect(calls.put).toEqual([first.cosKey]);
    expect(first.cosKey).toMatch(/^media\/\d{8}\/[0-9a-f]{64}\.png$/);

    const again = await upload([
      fileInput(`renamed-${RUN}.png`, "image/png", `png-bytes-${RUN}`),
    ]);
    expect(calls.put).toHaveLength(1); // 零新上传
    expect(again[0]!.id).toBe(first.id);
    expect(again[0]!.cosKey).toBe(first.cosKey);
  });
});

describe("媒体列表与删除(T033)", () => {
  it("列表 20/页+originalName q 过滤", async () => {
    await upload([
      fileInput(`alpha-${RUN}.png`, "image/png", `alpha-${RUN}`),
      fileInput(`beta-${RUN}.png`, "image/png", `beta-${RUN}`),
    ]);
    const page1 = await listMediaAssets({ page: 1 });
    expect(page1.pageSize).toBe(20);
    expect(page1.items.length).toBeGreaterThan(0);

    const hit = await listMediaAssets({ q: `alpha-${RUN}` });
    expect(hit.total).toBe(1);
    expect(hit.items[0]!.originalName).toBe(`alpha-${RUN}.png`);
  });

  it("删除=删 COS 对象+删行+审计;缺失 NOT_FOUND", async () => {
    const [asset] = await upload([fileInput(`gone-${RUN}.png`, "image/png", `gone-${RUN}`)]);
    if (!asset) throw new Error("upload returned no asset");
    await deleteMediaAsset(BigInt(asset.id), UPLOADER);
    expect(calls.del).toContain(asset.cosKey);
    await expect(
      prisma.mediaAsset.findUnique({ where: { cosKey: asset.cosKey } }),
    ).resolves.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.CONTENT_MEDIA_DELETED, actorUserId: UPLOADER },
      orderBy: { id: "desc" },
    });
    expect((audit.payloadJson as { cosKey?: string }).cosKey).toBe(asset.cosKey);
    await expect(errCode(deleteMediaAsset(BigInt(asset.id), UPLOADER))).resolves.toBe(
      "NOT_FOUND",
    );
  });
});

describe("媒体分类(2026-10-26 FileBird 对齐)", () => {
  it("上传带 category 入档;缺省归「其他」;category 筛选+counts 汇总", async () => {
    const [shop] = await upload([
      { ...fileInput(`shop-${RUN}.png`, "image/png", `shop-${RUN}`), category: "商店配图" },
    ]);
    const [misc] = await upload([fileInput(`misc-${RUN}.png`, "image/png", `misc-${RUN}`)]);
    if (!shop || !misc) throw new Error("upload returned no asset");
    expect(shop.category).toBe("商店配图");
    expect(misc.category).toBe("其他");

    const hit = await listMediaAssets({ q: `shop-${RUN}`, category: "商店配图" });
    expect(hit.total).toBe(1);
    expect(hit.items[0]!.category).toBe("商店配图");
    const miss = await listMediaAssets({ q: `shop-${RUN}`, category: "游戏资讯" });
    expect(miss.total).toBe(0);

    const all = await listMediaAssets({ q: `misc-${RUN}` });
    expect(all.counts["商店配图"]).toBeGreaterThanOrEqual(1);
    expect(all.counts["其他"]).toBeGreaterThanOrEqual(1);
  });
});
