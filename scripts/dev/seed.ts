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
  role?: "user" | "moderator" | "admin";
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
  const moderator = await upsertUser({
    username: "m3moderator",
    email: "moderator@example.local",
    password: "moderatorpass123",
    algo: "bcrypt_wp",
    role: "moderator",
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

/** M3 内容域 fixtures(T002):4 分类/文章草稿+发布/静态页/渐进节点 */
async function seedContent() {
  const categories = [
    { slug: "announcements", name: "公告", sort: 1 },
    { slug: "news", name: "资讯", sort: 2 },
    { slug: "guides", name: "资料梳理", sort: 3 },
    { slug: "devlog", name: "开发日志", sort: 4 },
  ];
  for (const c of categories) {
    await prisma.articleCategory.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }
  const announcements = await prisma.articleCategory.findUniqueOrThrow({
    where: { slug: "announcements" },
  });
  const now = new Date();
  const articleSeed = [
    {
      slug: "seed-announcement-welcome",
      title: "欢迎来到老克塔",
      bodyMd: "# 欢迎来到老克塔\n\n这是一篇种子公告,后台可编辑。",
      published: true,
      daysAgo: 1,
    },
    {
      slug: "seed-announcement-second",
      title: "服务器开放公告",
      bodyMd: "## 开放安排\n\n第一阶段即将开放。",
      published: true,
      daysAgo: 3,
    },
    {
      slug: "seed-article-draft",
      title: "草稿:未发布公告",
      bodyMd: "尚未写完的草稿。",
      published: false,
      daysAgo: 0,
    },
  ] as const;
  for (const a of articleSeed) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        slug: a.slug,
        title: a.title,
        bodyMd: a.bodyMd,
        categoryId: announcements.id,
        status: a.published ? "published" : "draft",
        publishedAt: a.published
          ? new Date(now.getTime() - a.daysAgo * 86_400_000)
          : null,
      },
    });
  }
  const pages = [
    { slug: "about", title: "项目简介", bodyMd: "# 项目简介\n\n老克塔是 60 年代怀旧服社区。" },
    { slug: "tutorial", title: "使用教程", bodyMd: "# 使用教程\n\n见下方下载锚点。" },
    { slug: "agreement", title: "用户协议", bodyMd: "# 用户协议\n\n怀旧公益服务条款。" },
    { slug: "convention", title: "论坛公约", bodyMd: "# 论坛公约\n\n友善交流,遵守公约。" },
    { slug: "sitemap", title: "网站地图", bodyMd: "# 网站地图\n\n全站导航清单。" },
  ] as const;
  for (const p of pages) {
    await prisma.contentPage.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, status: "published" },
    });
  }
  // 归档分页 fixture:11 篇种子公告(10/页 → 第 1 页 10 篇,第 2 页 3 篇)
  for (let i = 1; i <= 11; i++) {
    const slug = `seed-arch-${String(i).padStart(2, "0")}`;
    await prisma.article.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: `种子归档 ${i} 号`,
        bodyMd: `<p>种子归档正文 ${i}。</p>`,
        categoryId: announcements.id,
        status: "published",
        publishedAt: new Date(now.getTime() - (i + 3) * 86_400_000),
      },
    });
  }
  const progressionSeed = [
    { title: "第一阶段·开放测试", days: -30, status: "open" as const },
    { title: "第二阶段·熔火之心", days: 7, status: "open" as const },
    { title: "第三阶段·黑翼之巢", days: 60, status: "locked" as const },
  ];
  for (const [i, n] of progressionSeed.entries()) {
    const legacyKey = `seed-progression-${i + 1}`;
    await prisma.progressionNode.upsert({
      where: { legacyWpKey: legacyKey },
      update: {},
      create: {
        title: n.title,
        phaseDate: new Date(now.getTime() + n.days * 86_400_000),
        status: n.status,
        sort: i + 1,
        legacyWpKey: legacyKey,
      },
    });
  }
}

/** M3 论坛 fixtures(T002):2 版块/2 主题/4 楼层(含未映射作者快照) */
async function seedForum() {
  const boardSeed = [
    { slug: "guild-hall", name: "公会大厅", description: "公会招募与交流" },
    { slug: "trade", name: "交易行", description: "物品交易信息" },
  ];
  for (const [i, b] of boardSeed.entries()) {
    await prisma.forumBoard.upsert({
      where: { slug: b.slug },
      update: {},
      create: { ...b, sort: i + 1, legacyWpForumId: 1000 + i },
    });
  }
  const guildHall = await prisma.forumBoard.findUniqueOrThrow({
    where: { slug: "guild-hall" },
  });
  const moderator = await prisma.user.findUniqueOrThrow({
    where: { username: "m3moderator" },
  });
  const now = new Date();
  const threadSeed = [
    {
      legacyWpTopicId: 2001,
      title: "公会招收稳定成员",
      netTitle: null as string | null,
      authorUserId: moderator.id as bigint | null,
      authorName: "m3moderator",
      statusLabel: "standard" as const,
      pinned: true,
    },
    {
      legacyWpTopicId: 2002,
      title: "【已解决】附魔材料求购",
      netTitle: "附魔材料求购", // netTitle=剥【已解决】标签后的净标题
      authorUserId: null as number | null,
      authorName: "已注销老玩家", // 未映射作者快照行(authorUserId=null)
      statusLabel: "none" as const,
      pinned: false,
    },
  ];
  for (const t of threadSeed) {
    const existing = await prisma.forumThread.findUnique({
      where: { legacyWpTopicId: t.legacyWpTopicId },
    });
    if (existing) continue;
    const thread = await prisma.forumThread.create({
      data: {
        boardId: guildHall.id,
        title: t.netTitle ?? t.title,
        authorUserId: t.authorUserId,
        authorName: t.authorName,
        pinned: t.pinned,
        statusLabel: t.statusLabel,
        lastPostAt: now,
        legacyWpTopicId: t.legacyWpTopicId,
      },
    });
    await prisma.forumPost.create({
      data: {
        threadId: thread.id,
        floor: 1,
        authorUserId: t.authorUserId,
        authorName: t.authorName,
        contentHtml: `<p>${t.netTitle ?? t.title}——正文示例</p>`,
        legacyWpPostId: t.legacyWpTopicId,
      },
    });
    await prisma.forumPost.create({
      data: {
        threadId: thread.id,
        floor: 2,
        authorName: "路人甲",
        contentHtml: "<p>顶一下</p>",
        legacyWpPostId: t.legacyWpTopicId + 10_000,
      },
    });
    await prisma.forumThread.update({
      where: { id: thread.id },
      data: { replyCount: 1 },
    });
  }
  // 301 兼容层 fixture(route_map 进程内快照,须在 webServer 启动前落库)
  for (const b of boardSeed) {
    await prisma.routeMap.upsert({
      where: { oldKey: `forum:${b.slug === "guild-hall" ? 1000 : 1001}` },
      create: { oldKey: `forum:${b.slug === "guild-hall" ? 1000 : 1001}`, newPath: `/forum/${b.slug}` },
      update: { newPath: `/forum/${b.slug}`, enabled: true },
    });
  }
  const seeded = await prisma.forumThread.findMany({
    where: { legacyWpTopicId: { in: [2001, 2002] } },
    select: { id: true, legacyWpTopicId: true },
  });
  for (const t of seeded) {
    await prisma.routeMap.upsert({
      where: { oldKey: `topic:${t.legacyWpTopicId}` },
      create: { oldKey: `topic:${t.legacyWpTopicId}`, newPath: `/forum/thread/${t.id}` },
      update: { newPath: `/forum/thread/${t.id}`, enabled: true },
    });
  }
}

main()
  .then(seedPointRules)
  .then(seedDefaultCategory)
  .then(seedContent)
  .then(seedForum)
  .then(() => console.log("seed 完成"))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
