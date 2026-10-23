import "server-only";
import { PrismaClient as AuthPrismaClient } from "@/generated/auth";

const globalStore = globalThis as unknown as { __authPrisma?: AuthPrismaClient };

const client: AuthPrismaClient = globalStore.__authPrisma ?? new AuthPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalStore.__authPrisma = client;
}

/**
 * acore_auth.account 契约写收口(research R5):仅暴露三个方法。
 * 其余一律只读;根本防线是 MySQL 账号权限(仅 account 表 INSERT/UPDATE)。
 * username 约定 UPPER 存储(AzerothCore),本层统一转大写。
 */
export const authDb = {
  async createAccount(input: { username: string; email: string; shaPassHash: string }) {
    return client.account.create({
      data: {
        username: input.username.toUpperCase(),
        email: input.email,
        regMail: input.email,
        shaPassHash: input.shaPassHash,
      },
      select: { id: true, username: true },
    });
  },

  async updateAccountCredential(id: number, input: { shaPassHash: string }) {
    await client.account.update({
      where: { id },
      data: { shaPassHash: input.shaPassHash },
    });
  },

  async findByUsername(username: string) {
    return client.account.findFirst({
      where: { username: username.toUpperCase() },
      select: { id: true, username: true, shaPassHash: true, email: true },
    });
  },
};

export type AuthDb = typeof authDb;
