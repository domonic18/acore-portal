// 开发种子(合成数据,无生产用户;research R10)
// 对应 initdb 的游戏端 fixture 账号:legacyuser/bcryptuser/m1admin(见 init-game-schemas.sql)
// 幂等:按 username/code upsert,可反复执行
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { PrismaClient } from "../../src/generated/business";
import { hashPhpass } from "../../src/lib/auth/phpass";
import { hashWpBcrypt } from "../../src/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO } from "../../src/constants/password";
import { DEFAULT_SIDEBAR_CARDS } from "../../src/constants/sidebar";

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
      : await hashWpBcrypt(input.password);
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

/** M3 内容域 fixtures(T002):3 归档分类/文章草稿+发布/静态页(含开发日志)/渐进节点 */
async function seedContent() {
  const categories = [
    { slug: "announcements", name: "公告", sort: 1 },
    { slug: "news", name: "资讯", sort: 2 },
    { slug: "guides", name: "资料梳理", sort: 3 },
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
  const news = await prisma.articleCategory.findUniqueOrThrow({
    where: { slug: "news" },
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
    {
      slug: "tutorial",
      title: "使用教程",
      // 下载区标题驱动稳定锚点(#client_download/#patch_download/#login_download)
      bodyMd:
        "# 使用教程\n\n见下方下载指引。\n\n## 第三步： 下载客户端\n\n客户端下载说明。\n\n## 第四步：下载补丁文件\n\n补丁下载说明。\n\n## 第五步：下载登录器\n\n登录器下载说明。",
    },
    { slug: "agreement", title: "用户协议", bodyMd: "# 用户协议\n\n怀旧公益服务条款。" },
    { slug: "convention", title: "论坛公约", bodyMd: "# 论坛公约\n\n友善交流,遵守公约。" },
    { slug: "sitemap", title: "网站地图", bodyMd: "# 网站地图\n\n全站导航清单。" },
    // 快捷操作指南页(2026-11-03 升格;dev/test 库正文由 promote-guide-pages.mjs 灌真文)
    { slug: "hardcore-mode", title: "硬核模式介绍", bodyMd: "# 硬核模式介绍\n\n一命挑战规则说明。" },
    {
      slug: "mount-guide",
      title: "坐骑掉落与获取指南",
      bodyMd: "# 坐骑掉落与获取指南\n\n坐骑获取方式一览。",
    },
    {
      slug: "hd-client",
      title: "高清端下载与试用指南",
      bodyMd: "# 高清端下载与试用指南\n\n高清端安装说明。",
    },
    {
      slug: "client-extract",
      title: "客户端下载解压方法",
      bodyMd: "# 客户端下载解压方法\n\n下载与解压步骤。",
    },
    {
      slug: "login-troubleshoot",
      title: "常见登录问题排查",
      bodyMd: "# 常见登录问题排查\n\n无法登录排查步骤。",
    },
    {
      slug: "patch-guide",
      title: "补丁说明与生效方法",
      bodyMd: "# 补丁说明与生效方法\n\n补丁安装与生效说明。",
    },
  ] as const;
  for (const p of pages) {
    await prisma.contentPage.upsert({
      where: { slug: p.slug },
      update: { title: p.title, bodyMd: p.bodyMd },
      create: { ...p, status: "published" },
    });
  }
  // 开发日志是单页 Markdown(旧站 page 378 导入);正文 create-only,重跑 seed 不覆盖存量日志。
  // tocEnabled=false:页面级目录显式关闭(页面级优先于全局 content.tocEnabled,content E2E 断言用)
  await prisma.contentPage.upsert({
    where: { slug: "devlog" },
    update: { tocEnabled: false },
    create: {
      slug: "devlog",
      title: "开发日志",
      bodyMd:
        "# 开发日志\n\n## 2099-01-05 开发日志\n\n> 1、核心玩法框架完成\n> \n> 2、副本进度同步上线\n\n## 2099-01-02 开发日志\n\n> 1、账号迁移完成\n> \n> 2、积分系统对账通过",
      status: "published",
      tocEnabled: false,
    },
  });
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
  // 资讯卡片封面 fixture:正文首图(站内相对路径,免 COS 配置即过图片域白名单)
  await prisma.article.upsert({
    where: { slug: "seed-news-cover" },
    update: {},
    create: {
      slug: "seed-news-cover",
      title: "种子资讯:带封面图",
      bodyMd: "![封面](/images/banner-wotlk.svg)\n\n这是一篇带封面的种子资讯。",
      excerpt: "资讯列表卡片展示正文首图作为封面。",
      categoryId: news.id,
      status: "published",
      publishedAt: new Date(now.getTime() - 2 * 86_400_000),
    },
  });
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
  // 说明带换行+md 链接形态(E2E 断言板块说明渲染;对齐存量导入的 markdown 说明)
  const boardSeed = [
    {
      slug: "guild-hall",
      name: "公会大厅",
      description: "公会招募与交流\n招募帖请注明公会名与活动时间",
    },
    {
      slug: "trade",
      name: "交易行",
      description: "物品交易信息\n大额交易请先阅读[交易安全须知](/?p=169)",
    },
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

/** 侧栏快捷卡默认种子:按 key 幂等,已存在=保留后台编辑不覆盖;旧 download.* 值优先沿用 */
async function seedSidebarCards() {
  const legacyRows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: "download." } },
    select: { key: true, value: true },
  });
  const legacy = new Map(legacyRows.map((r) => [r.key, r.value]));
  const legacyKeys: Record<string, { url?: string; note?: string; body?: string }> = {
    client: { url: "download.client.url", note: "download.client.note" },
    patch: { url: "download.patch.url", note: "download.patch.note" },
    launcher: { url: "download.launcher.url", note: "download.launcher.note" },
    addon: { url: "download.addon.url", note: "download.addon.note" },
    yy: { body: "download.yy.note" },
  };

  for (const [index, card] of DEFAULT_SIDEBAR_CARDS.entries()) {
    const existing = await prisma.sidebarCard.findUnique({
      where: { key: card.key },
      select: { id: true },
    });
    if (existing) continue;
    const map = legacyKeys[card.key];
    const links = card.links.map((link, i) => ({
      label: link.label,
      href: (map?.url && legacy.get(map.url)) || link.href,
      note: (map?.note && legacy.get(map.note)) || link.note || null,
      sort: i + 1,
    }));
    await prisma.sidebarCard.create({
      data: {
        key: card.key,
        title: card.title,
        pages: card.pages,
        body: (map?.body && legacy.get(map.body)) || card.body || null,
        sort: index + 1,
        links: { create: links },
      },
    });
  }
}

main()
  .then(seedPointRules)
  .then(seedDefaultCategory)
  .then(seedContent)
  .then(seedForum)
  .then(seedSidebarCards)
  .then(() => console.log("seed 完成"))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
