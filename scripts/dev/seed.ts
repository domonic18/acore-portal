// 开发种子(合成数据,无生产用户;research R10)
// 对应 initdb 的游戏端 fixture 账号:legacyuser/bcryptuser/m1admin(见 init-game-schemas.sql)
// 幂等:按 username/code upsert,可反复执行
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { PrismaClient } from "../../src/generated/business";
import { hashPhpass } from "../../src/lib/auth/phpass";
import { hashWpBcrypt } from "../../src/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO } from "../../src/constants/password";

const prisma = new PrismaClient();

async function upsertUser(input: {
  username: string;
  email: string;
  password: string;
  algo: "phpass" | "bcrypt_wp";
  role?: "user" | "admin";
}) {
  // phpass 存量账号保持 $P$B 格式(登录时透明升级路径要用它)
  const passwordHash =
    input.algo === "phpass"
      ? hashPhpass(input.password)
      : hashWpBcrypt(input.password);
  return prisma.user.upsert({
    where: { username: input.username },
    update: {}, // 已存在则不动(保留可能的升级后状态)
    create: {
      username: input.username,
      email: input.email,
      passwordHash,
      passwordAlgo: input.algo,
      role: input.role ?? "user",
    },
  });
}

async function main() {
  const legacy = await upsertUser({
    username: "legacyuser",
    email: "legacy@example.local",
    password: "oldpass123",
    algo: "phpass",
  });
  const bcrypt = await upsertUser({
    username: "bcryptuser",
    email: "bcrypt@example.local",
    password: "oldpass456",
    algo: "bcrypt_wp",
  });
  const admin = await upsertUser({
    username: "m1admin",
    email: "admin@example.local",
    password: "adminpass123",
    algo: "bcrypt_wp",
    role: "admin",
  });

  const available = await prisma.invitationCode.upsert({
    where: { code: "M1TEST-AVAILABLE-0001" },
    update: {},
    create: {
      code: "M1TEST-AVAILABLE-0001",
      prefix: "M1TEST",
      length: 19,
      maxUses: 5,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: admin.id,
    },
  });
  const disabled = await prisma.invitationCode.upsert({
    where: { code: "M1TEST-DISABLED-0001" },
    update: { status: "disabled" },
    create: {
      code: "M1TEST-DISABLED-0001",
      prefix: "M1TEST",
      length: 19,
      maxUses: 5,
      status: "disabled",
      createdBy: admin.id,
    },
  });

  console.log(
    [
      `legacyuser(${legacy.id}, phpass)`,
      `bcryptuser(${bcrypt.id}, bcrypt_wp)`,
      `m1admin(${admin.id}, admin)`,
      `code: ${available.code}(available)`,
      `code: ${disabled.code}(disabled)`,
    ].join("\n"),
  );
}

/** 积分规则种子(data-model §2.6):register=2 保持 M1 行为;badge_grant=0 后台可调 */
async function seedPointRules() {
  const rules = [
    { event: "register", amount: 2, remark: "注册奖励" },
    { event: "badge_grant", amount: 0, remark: "徽章授予奖励分值(后台按需调整)" },
  ];
  for (const rule of rules) {
    await prisma.pointRule.upsert({
      where: { event: rule.event },
      update: {},
      create: { event: rule.event, amount: rule.amount, enabled: true, remark: rule.remark },
    });
  }
}

/** 默认商品分类:商品新建表单下拉依赖至少一个分类(空库 categoryId 无默认可选) */
async function seedDefaultCategory() {
  await prisma.productCategory.upsert({
    where: { slug: "general" },
    update: {},
    create: { name: "通用", slug: "general", sort: 1 },
  });
}

main()
  .then(seedPointRules)
  .then(seedDefaultCategory)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
