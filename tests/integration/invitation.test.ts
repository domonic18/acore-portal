import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateInvitationCodes,
  UsersAdminError,
} from "@/server/services/users-admin/admin";
import { INVITATION_ALPHABET, INVITATION_LIMITS } from "@/constants/invitation";

/**
 * issue #80:邀请码生成边界与字符集单一真相源。
 * service 层与路由 schema 共用 constants/invitation.ts,越界一律 PARAM_INVALID 且零写入。
 */
const RUN = Date.now().toString(36);
const username = `t_${RUN}_inv_admin`.slice(0, 32);
let operatorId = 0n;
const created: string[] = [];

async function expectInvalid(input: {
  prefix: string;
  length: number;
  count: number;
  maxUses: number;
}) {
  const err = await generateInvitationCodes({
    ...input,
    operatorId,
  }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(UsersAdminError);
  return err as UsersAdminError;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `invtest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true },
  });
  operatorId = user.id;
});

afterAll(async () => {
  if (created.length) {
    await prisma.invitationCode.deleteMany({ where: { code: { in: created } } });
  }
  await prisma.auditLog.deleteMany({ where: { actorUserId: operatorId } });
  await prisma.user.deleteMany({ where: { id: operatorId } });
  await prisma.$disconnect();
});

describe("邀请码边界(#80)", () => {
  it("越界参数一律 PARAM_INVALID:前缀/长度/数量/上限/随机段", async () => {
    const base = { prefix: "LK", length: 12, count: 1, maxUses: 1 };

    await expectInvalid({ ...base, prefix: "L" }); // 前缀过短
    await expectInvalid({ ...base, prefix: "L".repeat(INVITATION_LIMITS.PREFIX_MAX + 1) });
    await expectInvalid({ ...base, prefix: "lk" }); // 小写
    await expectInvalid({ ...base, length: INVITATION_LIMITS.LENGTH_MIN - 1 });
    await expectInvalid({ ...base, length: INVITATION_LIMITS.LENGTH_MAX + 1 });
    await expectInvalid({ ...base, count: 0 });
    await expectInvalid({ ...base, count: INVITATION_LIMITS.COUNT_MAX + 1 });
    await expectInvalid({ ...base, maxUses: 0 });
    await expectInvalid({ ...base, maxUses: INVITATION_LIMITS.MAX_USES_MAX + 1 });
    // 前缀吃掉长度:随机段不足
    await expectInvalid({
      ...base,
      prefix: "LONGPRE",
      length: INVITATION_LIMITS.LENGTH_MIN,
    });
  });

  it("合法参数生成码值符合形态:前缀-随机段,随机段取自登记字符集", async () => {
    const codes = await generateInvitationCodes({
      prefix: "LK",
      length: 12,
      count: 3,
      maxUses: 5,
      operatorId,
    });
    created.push(...codes);

    expect(codes).toHaveLength(3);
    const bodyLen = 12 - "LK".length - 1;
    for (const code of codes) {
      expect(code.startsWith("LK-")).toBe(true);
      const body = code.slice("LK-".length);
      expect(body).toHaveLength(bodyLen);
      for (const ch of body) {
        expect(INVITATION_ALPHABET, ch).toContain(ch);
      }
    }
    expect(new Set(codes).size).toBe(3);
  });
});
