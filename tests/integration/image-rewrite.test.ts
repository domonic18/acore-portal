import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  rewriteLegacyImageUrls,
  LEGACY_UPLOADS_PREFIX,
  PLACEHOLDER_IMAGE,
} from "@/server/services/images/rewrite";

/**
 * T061 US6 富文本旧图片 URL 重写(data-model §2.8;FR-132):
 * seed image_asset_map 命中行 → 输入含三类 URL(绝对带 host/相对路径/多引用)的 HTML,
 * 断言命中替换 newUrl、未命中回退占位、无旧引用残留;重写结果再过一遍幂等。
 */
const RUN = Date.now().toString(36);
const HIT = `/wp-content/uploads/2024/03/t61-hit-${RUN}.jpg`;
const HIT_MULTI = `/wp-content/uploads/2024/04/t61-multi-${RUN}.webp`;

afterAll(async () => {
  await prisma.imageAssetMap.deleteMany({ where: { oldUrl: { in: [HIT, HIT_MULTI] } } });
});

describe("US6 富文本图片 URL 重写(T061)", () => {
  it("命中替换 newUrl,未命中回退占位,归一化去 host", async () => {
    await prisma.imageAssetMap.create({
      data: { oldUrl: HIT, newUrl: "https://cdn.lokta.cn/uploads/hit.jpg", fileHash: "t61hash" },
    });

    const html = [
      `<img src="https://old.lokta.cn${HIT}">`,
      `<img src="${HIT}">`,
      `<img src="https://other-host.com${HIT}">`,
      `<img src="/wp-content/uploads/2024/03/t61-missing-${RUN}.png">`,
    ].join("\n");

    const out = await rewriteLegacyImageUrls(html);

    expect(out).not.toContain(LEGACY_UPLOADS_PREFIX);
    expect((out.match(new RegExp("https://cdn.lokta.cn/uploads/hit.jpg", "g")) ?? []).length).toBe(3);
    expect(out).toContain(PLACEHOLDER_IMAGE);
  });

  it("重写结果幂等(再过一遍不变),多引用统一替换", async () => {
    await prisma.imageAssetMap.create({
      data: {
        oldUrl: HIT_MULTI,
        newUrl: "https://cdn.lokta.cn/uploads/multi.webp",
        fileHash: "t61m",
      },
    });

    const html = `<img src="${HIT_MULTI}"><img src="https://old.lokta.cn${HIT_MULTI}">`;
    const once = await rewriteLegacyImageUrls(html);
    expect(once).not.toContain(LEGACY_UPLOADS_PREFIX);
    expect((once.match(/cdn\.lokta\.cn\/uploads\/multi\.webp/g) ?? []).length).toBe(2);

    const twice = await rewriteLegacyImageUrls(once);
    expect(twice).toBe(once);
  });
});
