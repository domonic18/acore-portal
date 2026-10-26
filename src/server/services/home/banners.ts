import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 首页轮播物料管理(US 首页轮播):前台取 enabled 升序,后台全量管理;
 * 物料无外键依赖,删除不级联;保存/删除均审计(category=content)。
 */

export class BannerAdminError extends Error {
  constructor(public code: "NOT_FOUND", message?: string) {
    super(message ?? `banner_admin_error: ${code}`);
    this.name = "BannerAdminError";
  }
}

export type BannerInput = {
  title: string;
  imageUrl: string;
  linkUrl: string;
  sort: number;
  enabled: boolean;
};

/** 前台:仅 enabled,sort 升序稳定轮播 */
export async function listActiveBanners() {
  return prisma.homeBanner.findMany({
    where: { enabled: true },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, title: true, imageUrl: true, linkUrl: true },
  });
}

/** 后台列表:含停用物料 */
export async function listAllBanners() {
  const rows = await prisma.homeBanner.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    title: r.title,
    imageUrl: r.imageUrl,
    linkUrl: r.linkUrl,
    sort: r.sort,
    enabled: r.enabled,
  }));
}

function auditPayload(id: bigint, input: BannerInput) {
  return {
    bannerId: id.toString(),
    title: input.title,
    enabled: input.enabled,
    sort: input.sort,
  };
}

export async function createBanner(input: BannerInput, actorId: bigint): Promise<bigint> {
  const created = await prisma.homeBanner.create({ data: input, select: { id: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.HOME_BANNER_SAVED,
    actorUserId: actorId,
    payload: auditPayload(created.id, input),
  });
  return created.id;
}

export async function updateBanner(
  id: bigint,
  input: BannerInput,
  actorId: bigint,
): Promise<void> {
  const hit = await prisma.homeBanner.updateMany({ where: { id }, data: input });
  if (hit.count === 0) throw new BannerAdminError("NOT_FOUND", "轮播物料不存在。");
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.HOME_BANNER_SAVED,
    actorUserId: actorId,
    payload: auditPayload(id, input),
  });
}

export async function deleteBanner(id: bigint, actorId: bigint): Promise<void> {
  const banner = await prisma.homeBanner.delete({
    where: { id },
    select: { title: true },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.HOME_BANNER_DELETED,
    actorUserId: actorId,
    payload: { bannerId: id.toString(), title: banner.title },
  });
}
