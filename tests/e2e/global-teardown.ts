import { PrismaClient } from "../../src/generated/business";
import { TOOL_PAGES } from "../../src/constants/tools";

export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    await prisma.routeMap.deleteMany({
      where: {
        oldKey: {
          in: ["p:999", ...TOOL_PAGES.map((t) => `page_id:${t.legacyPageId}`)],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
