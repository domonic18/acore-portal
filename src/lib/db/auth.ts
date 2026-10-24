import "server-only";
import { PrismaClient as AuthPrismaClient } from "@/generated/auth";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __authPrisma?: AuthPrismaClient };

/** 连接串存 system_config(gamedb.auth),首次调用建连并缓存(globalThis 防 dev HMR 泄漏) */
async function getClient(): Promise<AuthPrismaClient> {
  if (!globalStore.__authPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__authPrisma = new AuthPrismaClient({ datasourceUrl: gamedb.auth });
  }
  return globalStore.__authPrisma;
}

/**
 * acore_auth.account 契约写收口(research R5):仅暴露三个方法。
 * 其余一律只读;根本防线是 MySQL 账号权限(仅 account 表 INSERT/UPDATE)。
 * username 约定 UPPER 存储(AzerothCore),本层统一转大写。
 */
export const authDb = {
  async createAccount(input: { username: string; email: string; shaPassHash: string }) {
    const client = await getClient();
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
    const client = await getClient();
    await client.account.update({
      where: { id },
      data: { shaPassHash: input.shaPassHash },
    });
  },

  async findByUsername(username: string) {
    const client = await getClient();
    return client.account.findFirst({
      where: { username: username.toUpperCase() },
      select: { id: true, username: true, shaPassHash: true, email: true },
    });
  },
};

export type AuthDb = typeof authDb;
