import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAccountProfile,
  updateAccountNickname,
} from "@/server/services/account/profile";
import { listCharactersForUser } from "@/server/services/account/characters";
import { getRestorableItems } from "@/server/services/account/restore-items";
import { findRefreshSubject } from "@/server/services/auth/session-refresh";
import { getSiteUsername } from "@/server/services/shared/site-identity";

/**
 * #5 收尾:app/ 层 prisma 直连下沉后,账户/续期路由依赖的服务函数。
 * 只覆盖不触达游戏库的分支(游戏库链路由 E2E account.spec 覆盖)。
 */
const RUN = Date.now().toString(36);
const created: string[] = [];

async function makeUser(overrides: { status?: "active" | "banned" } = {}) {
  const username = `acct_${RUN}_${created.length}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: "not-used-in-this-test",
      passwordAlgo: "phpass",
      status: overrides.status ?? "active",
    },
  });
  created.push(username);
  return user;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`; // 服务不可达时快速失败(先 make up)
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: created } } });
  await prisma.$disconnect();
});

describe("站点身份与账户资料服务", () => {
  it("getSiteUsername 命中返回用户名,缺失返回 null", async () => {
    const user = await makeUser();
    expect(await getSiteUsername(user.id)).toBe(user.username);
    expect(await getSiteUsername(BigInt("999999999999"))).toBeNull();
  });

  it("updateAccountNickname 落库并可被 getAccountProfile 读回", async () => {
    const user = await makeUser();
    const updated = await updateAccountNickname(user.id, "新昵称");
    expect(updated.nickname).toBe("新昵称");

    const profile = await getAccountProfile(user.id);
    expect(profile.nickname).toBe("新昵称");
    expect(profile.username).toBe(user.username);
  });
});

describe("API 路由下沉的服务函数", () => {
  it("listCharactersForUser 用户缺失返回 null(路由转 401)", async () => {
    expect(await listCharactersForUser(BigInt("999999999999"))).toBeNull();
  });

  it("getRestorableItems 用户缺失返回 USER_NOT_FOUND(不碰游戏库)", async () => {
    const result = await getRestorableItems({
      userId: BigInt("999999999999"),
      guid: 1,
    });
    expect(result).toEqual({ ok: false, reason: "USER_NOT_FOUND" });
  });

  it("findRefreshSubject 返回角色/状态,封禁态可见,缺失返回 null", async () => {
    const user = await makeUser({ status: "banned" });
    const subject = await findRefreshSubject(user.id);
    expect(subject).toEqual({ id: user.id, role: "user", status: "banned" });

    expect(await findRefreshSubject(BigInt("999999999999"))).toBeNull();
  });
});
