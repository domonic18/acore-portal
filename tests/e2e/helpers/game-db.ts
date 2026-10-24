import { PrismaClient as AuthClient } from "../../../src/generated/auth";
import { PrismaClient } from "../../../src/generated/business";

/**
 * e2e 专用游戏 auth 库客户端:连接串读 system_config(gamedb.auth),
 * 与被测服务同源;不 import 项目 lib(避免 server-only 边界)。
 */
const prisma = new PrismaClient();
let authClient: AuthClient | null = null;

export async function getAuthClient(): Promise<AuthClient> {
  if (!authClient) {
    const row = await prisma.systemConfig.findUniqueOrThrow({
      where: { key: "gamedb.auth" },
      select: { value: true },
    });
    authClient = new AuthClient({ datasourceUrl: row.value });
  }
  return authClient;
}

export function getPrisma(): PrismaClient {
  return prisma;
}

export async function disconnectGameDb(): Promise<void> {
  await authClient?.$disconnect();
  authClient = null;
}
