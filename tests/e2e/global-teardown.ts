import { PrismaClient } from "../../src/generated/business";

export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    await prisma.routeMap.deleteMany({ where: { oldKey: "p:999" } });
  } finally {
    await prisma.$disconnect();
  }
}
