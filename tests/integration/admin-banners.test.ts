import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  BannerAdminError,
  createBanner,
  deleteBanner,
  listActiveBanners,
  listAllBanners,
  updateBanner,
} from "@/server/services/home/banners";
import { AUDIT_ACTION } from "@/constants/audit";
import { CORE_PAGE_SLUGS, HOME_CAROUSEL_FALLBACK_HREF } from "@/constants/content";

/**
 * 首页轮播物料服务集成:CRUD 落库+审计(HOME_BANNER_SAVED/DELETED)、
 * 前台仅 enabled 升序、NOT_FOUND。
 */
const RUN = Date.now().toString(36);
const TITLE_PREFIX = `e2ebanner${RUN}-`;
const ACTOR = 9_950_041_001n; // 审计 actor(无 FK,用后按 actor 清)
const createdIds: bigint[] = [];

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof BannerAdminError) return err.code;
    throw err;
  }
  throw new Error("expected BannerAdminError");
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const stale = await prisma.homeBanner.findMany({
    where: { title: { startsWith: TITLE_PREFIX } },
    select: { id: true },
  });
  await prisma.homeBanner.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR } });
  await prisma.homeBanner.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });
  await prisma.$disconnect();
});

describe("首页轮播物料管理", () => {
  it("创建→前台仅 enabled 升序;停用不出前台", async () => {
    const b2 = await createBanner(
      { title: `${TITLE_PREFIX}b2`, imageUrl: "/images/b.png", linkUrl: "https://example.com/b", sort: 2, enabled: true },
      ACTOR,
    );
    const b1 = await createBanner(
      { title: `${TITLE_PREFIX}b1`, imageUrl: "/images/a.png", linkUrl: "", sort: 1, enabled: true },
      ACTOR,
    );
    const bOff = await createBanner(
      { title: `${TITLE_PREFIX}off`, imageUrl: "/images/off.png", linkUrl: "", sort: 0, enabled: false },
      ACTOR,
    );
    createdIds.push(b1, b2, bOff);

    const active = (await listActiveBanners()).filter((b) => b.title.startsWith(TITLE_PREFIX));
    expect(active.map((b) => b.title)).toEqual([`${TITLE_PREFIX}b1`, `${TITLE_PREFIX}b2`]);

    // 停用 b2 → 前台只剩 b1;后台仍三条
    await updateBanner(b2, { title: `${TITLE_PREFIX}b2`, imageUrl: "/images/b.png", linkUrl: "https://example.com/b", sort: 2, enabled: false }, ACTOR);
    expect(
      (await listActiveBanners()).filter((b) => b.title.startsWith(TITLE_PREFIX)).map((b) => b.title),
    ).toEqual([`${TITLE_PREFIX}b1`]);
    expect(
      (await listAllBanners()).filter((b) => b.title.startsWith(TITLE_PREFIX)),
    ).toHaveLength(3);
  });

  it("保存/删除审计;更新不存在 NOT_FOUND", async () => {
    const id = await createBanner(
      { title: `${TITLE_PREFIX}audit`, imageUrl: "/images/x.png", linkUrl: "", sort: 5, enabled: true },
      ACTOR,
    );
    createdIds.push(id);
    await updateBanner(id, { title: `${TITLE_PREFIX}audit2`, imageUrl: "/images/y.png", linkUrl: "https://example.com", sort: 6, enabled: false }, ACTOR);

    const savedAudits = await prisma.auditLog.findMany({
      where: { actorUserId: ACTOR, action: AUDIT_ACTION.HOME_BANNER_SAVED },
      orderBy: { id: "asc" },
    });
    const last = savedAudits[savedAudits.length - 1];
    expect(last?.payloadJson).toMatchObject({
      bannerId: id.toString(),
      title: `${TITLE_PREFIX}audit2`,
      enabled: false,
      sort: 6,
    });

    await deleteBanner(id, ACTOR);
    expect(await prisma.homeBanner.findUnique({ where: { id } })).toBeNull();
    const delAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR, action: AUDIT_ACTION.HOME_BANNER_DELETED },
      orderBy: { id: "desc" },
    });
    expect(delAudit.payloadJson).toMatchObject({
      bannerId: id.toString(),
      title: `${TITLE_PREFIX}audit2`,
    });

    await expect(errCode(updateBanner(9_999_999n, { title: "x", imageUrl: "/x.png", linkUrl: "", sort: 0, enabled: true }, ACTOR))).resolves.toBe("NOT_FOUND");
  });

  /**
   * 轮播视频地址(2026-11-06):缺省=保持现值,空串=显式清空。
   * 拖拽排序/启停开关的 payload 不带 videoUrl,不得把已配视频静默清空。
   */
  it("videoUrl:存取通;缺省更新不覆盖;空串清空", async () => {
    const videoUrl = "/uploads/media/20261106/e2evideo.mp4";
    const id = await createBanner(
      { title: `${TITLE_PREFIX}video`, imageUrl: "/images/v.png", videoUrl, linkUrl: "", sort: 7, enabled: true },
      ACTOR,
    );
    createdIds.push(id);

    expect((await listActiveBanners()).find((b) => b.id === id)?.videoUrl).toBe(videoUrl);

    // 缺省(排序/启停 payload 形态)→ 保持现值
    await updateBanner(id, { title: `${TITLE_PREFIX}video`, imageUrl: "/images/v.png", linkUrl: "", sort: 8, enabled: true }, ACTOR);
    expect((await listAllBanners()).find((b) => b.id === String(id))?.videoUrl).toBe(videoUrl);

    // 空串 → 显式清空
    await updateBanner(id, { title: `${TITLE_PREFIX}video`, imageUrl: "/images/v.png", videoUrl: "", linkUrl: "", sort: 8, enabled: true }, ACTOR);
    expect((await listAllBanners()).find((b) => b.id === String(id))?.videoUrl).toBeNull();
  });
});

/**
 * 首页轮播空物料兜底:无启用物料时前台回落默认 hero 图,兜底图可点跳项目简介页。
 * 组件里的兜底分支不落库,故此处守住兜底契约的两端:
 * ① 无启用物料 → 前台拿不到物料(兜底分支成立);② 兜底链接目标须是已发布的核心页(点了不 404)。
 */
describe("首页轮播空物料兜底", () => {
  it("无启用物料 + 兜底目标为已发布核心页", async () => {
    const snapshot = await prisma.homeBanner.findMany();
    await prisma.homeBanner.deleteMany({});
    try {
      expect(await listActiveBanners()).toEqual([]);

      const slug = HOME_CAROUSEL_FALLBACK_HREF.replace(/^\//, "");
      expect(CORE_PAGE_SLUGS).toContain(slug);
      const existed = await prisma.contentPage.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existed) {
        await prisma.contentPage.create({
          data: { slug, title: "项目简介", bodyMd: "# 项目简介", status: "published" },
        });
      }
      try {
        const page = await prisma.contentPage.findUniqueOrThrow({
          where: { slug },
          select: { status: true },
        });
        expect(page.status).toBe("published");
      } finally {
        if (!existed) await prisma.contentPage.deleteMany({ where: { slug } });
      }
    } finally {
      await prisma.homeBanner.createMany({
        data: snapshot.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest),
      });
    }
  });
});
