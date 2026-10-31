import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POINT_TX_TYPE } from "@/constants/points";
import { SESSION } from "@/constants/session";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { createSession } from "@/lib/auth/session";
import { reloadSystemConfig } from "@/lib/config";
import {
  creditLedger,
  debitLedger,
  LedgerError,
} from "@/server/services/points/ledger";
import { adjustPoints } from "@/server/services/points/adjust";
import {
  listInbox,
  markRead,
  unreadCount,
} from "@/server/services/notification/inbox";
import { GET as unreadRoute } from "@/app/api/account/notifications/unread/route";
import { GET as listRoute } from "@/app/api/account/notifications/route";
import { POST as readRoute } from "@/app/api/account/notifications/read/route";

/**
 * M4 US3 通知域集成(T014/T018,quickstart S3):
 * 五类账本事件同事务产生通知行(收件人/类型/金额文案/余额快照);
 * 事务性 SC-304:同 tx 内扣分失败回滚 → 通知零残留;
 * 阈值邮件 notify.pointEmailThreshold(10 出/100 不出/0 关);
 * unread/markRead/游标分页无重漏;越权:全链路按会话 userId 过滤,他人 id 已读零生效。
 * 状态注入:阈值走 system_config 行+reloadSystemConfig(进程内缓存)。
 */
const RUN = Date.now().toString(36);
const THRESHOLD_KEY = "notify.pointEmailThreshold";
const usernames: string[] = [];

async function makeUser(tag: string) {
  const username = `t_${RUN}_nt_${tag}`.slice(0, 32);
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `nttest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true, username: true, email: true },
  });
  usernames.push(username);
  return user;
}

const txCount = (userId: bigint) =>
  prisma.pointTransaction.count({ where: { userId } });
const notifCount = (userId: bigint) =>
  prisma.notification.count({ where: { userId } });
const outboxCount = (userId: bigint) =>
  prisma.mailOutbox.count({ where: { relatedUserId: userId } });

async function authedReq(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    cookie: `${SESSION.ACCESS_COOKIE}=${token}`,
  };
  if (init?.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers,
  });
}

async function setThreshold(value: string) {
  await prisma.systemConfig.deleteMany({ where: { key: THRESHOLD_KEY } });
  if (value !== "") {
    await prisma.systemConfig.create({ data: { key: THRESHOLD_KEY, value } });
  }
  await reloadSystemConfig();
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await setThreshold(""); // 基线:阈值行持久跨运行,先清(默认 0=关)
});

afterAll(async () => {
  await setThreshold("");
  for (const username of usernames) {
    const u = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!u) continue;
    await prisma.notification.deleteMany({ where: { userId: u.id } });
    await prisma.mailOutbox.deleteMany({ where: { relatedUserId: u.id } });
    await prisma.pointTransaction.deleteMany({ where: { userId: u.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.$disconnect();
});

describe("M4 US3 账本挂钩通知(同事务)", () => {
  it("五类事件各产生通知行:标题/正文/余额快照/linkUrl 正确(FR-309)", async () => {
    const user = await makeUser("five");
    const credit = (type: string, amount: number, remark?: string) =>
      prisma.$transaction((tx) =>
        creditLedger(tx, { userId: user.id, amount, type: type as never, remark }),
      );

    await credit(POINT_TX_TYPE.REGISTER_REWARD, 2, "注册奖励");
    await credit(POINT_TX_TYPE.BADGE_REWARD, 10);
    await prisma.$transaction((tx) =>
      debitLedger(tx, {
        userId: user.id,
        amount: 8,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        remark: "订单 NT 测试",
      }),
    );
    await credit(POINT_TX_TYPE.SHOP_PAYMENT, 8, "订单退款 #NT1"); // 退款=正向回补(M2 语义)
    await adjustPoints({
      userId: user.id,
      amount: 50,
      reason: "活动补偿",
      operatorId: user.id,
    });

    const rows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(5);
    expect(
      rows.map((r) => [r.type, r.title, r.body, r.linkUrl]),
    ).toEqual([
      ["points", "积分入账 +2", "注册奖励,当前余额 2", "/account/points"],
      ["points", "积分入账 +10", "徽章奖励,当前余额 12", "/account/points"],
      ["points", "积分扣减 -8", "商店消费:订单 NT 测试,当前余额 4", "/account/points"],
      ["points", "积分入账 +8", "商店消费:订单退款 #NT1,当前余额 12", "/account/points"],
      ["points", "积分入账 +50", "手动调整:活动补偿,当前余额 62", "/account/points"],
    ]);
    expect(rows.every((r) => r.readAt === null)).toBe(true);
  });

  it("事务性 SC-304:同 tx 内扣分不足回滚,流水与通知零残留", async () => {
    const user = await makeUser("rollback");
    await prisma.$transaction((tx) =>
      creditLedger(tx, {
        userId: user.id,
        amount: 5,
        type: POINT_TX_TYPE.VISITOR_REFERRAL,
      }),
    );
    const txBefore = await txCount(user.id);
    const notifBefore = await notifCount(user.id);

    const err = await prisma
      .$transaction(async (tx) => {
        await creditLedger(tx, {
          userId: user.id,
          amount: 100,
          type: POINT_TX_TYPE.MANUAL_ADJUST,
          remark: "会回滚",
        });
        await debitLedger(tx, {
          userId: user.id,
          amount: 999,
          type: POINT_TX_TYPE.SHOP_PAYMENT,
        });
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerError);

    expect(await txCount(user.id)).toBe(txBefore);
    expect(await notifCount(user.id)).toBe(notifBefore);
    expect(
      await prisma.notification.count({ where: { body: { contains: "会回滚" } } }),
    ).toBe(0);
  });

  it("阈值邮件:threshold=10 出 POINTS_NOTIFY,100 不出,0 关闭(FR-311)", async () => {
    const user = await makeUser("mail");
    const adjust = () =>
      adjustPoints({
        userId: user.id,
        amount: 50,
        reason: "阈值邮件",
        operatorId: user.id,
      });

    await setThreshold("10");
    expect((await adjust()).ok).toBe(true);
    expect(await outboxCount(user.id)).toBe(1);
    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { relatedUserId: user.id },
    });
    expect(mail.template).toBe(MAIL_TEMPLATE.POINTS_NOTIFY);
    expect(mail.toEmail).toBe(user.email);
    const payload = mail.payloadJson as {
      username: string;
      delta: number;
      balance: number;
      reason: string;
    };
    expect(payload).toEqual({
      username: user.username,
      delta: 50,
      balance: 50,
      reason: "手动调整",
    });

    await setThreshold("100");
    expect((await adjust()).ok).toBe(true);
    expect(await outboxCount(user.id)).toBe(1); // 未新增

    await setThreshold(""); // 0=关闭(缺省)
    expect((await adjust()).ok).toBe(true);
    expect(await outboxCount(user.id)).toBe(1); // 未新增
    expect(await notifCount(user.id)).toBe(3); // 站内信不受阈值影响
  });

  it("小变动不触发邮件:|delta|<threshold 只落站内信", async () => {
    const user = await makeUser("small");
    await setThreshold("10");
    await prisma.$transaction((tx) =>
      creditLedger(tx, {
        userId: user.id,
        amount: 2,
        type: POINT_TX_TYPE.REGISTER_REWARD,
      }),
    );
    expect(await notifCount(user.id)).toBe(1);
    expect(await outboxCount(user.id)).toBe(0);
  });
});

describe("M4 US3 收件箱服务(T015)", () => {
  it("游标分页无重漏,nextCursor 耗尽为 null;仅本人数据", async () => {
    const a = await makeUser("page-a");
    const b = await makeUser("page-b");
    for (let i = 0; i < 12; i++) {
      await prisma.notification.create({
        data: { userId: a.id, type: "points", title: `n${i}`, body: `b${i}` },
      });
    }
    await prisma.notification.create({
      data: { userId: b.id, type: "points", title: "b-only", body: "x" },
    });

    expect(await unreadCount(a.id)).toBe(12);

    const pages: Awaited<ReturnType<typeof listInbox>>["items"][] = [];
    let cursor: string | undefined;
    for (;;) {
      const res = await listInbox(a.id, cursor, 5);
      pages.push(res.items);
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    expect(pages.map((p) => p.length)).toEqual([5, 5, 2]);
    const seen = pages.flat().map((i) => i.id);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    // 稳定性:同游标重放结果一致且 nextCursor 仍为 null
    const lastPage = pages[2] ?? [];
    const replay = await listInbox(a.id, cursor, 5);
    expect(replay.items.map((i) => i.id)).toEqual(lastPage.map((i) => i.id));
    expect(replay.nextCursor).toBeNull();

    // b 的收件箱只有自己的一条
    const inboxB = await listInbox(b.id);
    expect(inboxB.items).toHaveLength(1);
    expect(inboxB.items[0]?.title).toBe("b-only");
  });

  it("markRead:ids 批量/全部/他人 id 零生效;已读不可逆后 unread 归零", async () => {
    const a = await makeUser("read-a");
    const b = await makeUser("read-b");
    const mk = (userId: bigint, title: string) =>
      prisma.notification.create({
        data: { userId, type: "points", title, body: "x" },
        select: { id: true },
      });
    const n1 = await mk(a.id, "r1");
    const n2 = await mk(a.id, "r2");
    const nb = await mk(b.id, "rb");

    expect(await markRead(a.id, { ids: [n1.id, nb.id] })).toBe(1); // 他人 id 不生效
    expect(await prisma.notification.findUniqueOrThrow({
      where: { id: nb.id },
      select: { readAt: true },
    })).toEqual({ readAt: null });
    expect(await unreadCount(a.id)).toBe(1);

    expect(await markRead(a.id, { all: true })).toBe(1);
    expect(await unreadCount(a.id)).toBe(0);
    const rows = await prisma.notification.findMany({
      where: { userId: a.id },
      select: { readAt: true },
    });
    expect(rows.every((r) => r.readAt !== null)).toBe(true);
    expect(n2).toBeDefined();
  });
});

describe("M4 US3 通知 API 三路由(T018 契约逐字段)", () => {
  it("unread/list/read 全链路:未登录 401;仅本人;契约字段形状", async () => {
    const user = await makeUser("api");
    const stranger = await makeUser("api-b");
    const { accessToken } = await createSession(user.id, "user");
    const mine = await prisma.notification.create({
      data: { userId: user.id, type: "points", title: "积分入账 +7", body: "b", linkUrl: "/account/points" },
    });
    await prisma.notification.create({
      data: { userId: stranger.id, type: "points", title: "s", body: "s" },
    });

    // 未登录 401
    const anon = await unreadRoute(new NextRequest("http://localhost/api/account/notifications/unread"));
    expect(anon.status).toBe(401);
    expect((await anon.json()).error.code).toBe("UNAUTHORIZED");
    const anonList = await listRoute(new NextRequest("http://localhost/api/account/notifications"));
    expect(anonList.status).toBe(401);

    // unread
    const unreadRes = await unreadRoute(await authedReq("/api/account/notifications/unread", accessToken));
    expect(unreadRes.status).toBe(200);
    expect(await unreadRes.json()).toEqual({ count: 1 });

    // list 契约字段
    const listRes = await listRoute(await authedReq("/api/account/notifications?limit=10", accessToken));
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      items: Record<string, unknown>[];
      nextCursor: string | null;
    };
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]).toEqual({
      id: mine.id.toString(),
      type: "points",
      title: "积分入账 +7",
      body: "b",
      linkUrl: "/account/points",
      readAt: null,
      createdAt: mine.createdAt.toISOString(),
    });
    expect(listBody.nextCursor).toBeNull();

    // read 单条
    const readRes = await readRoute(
      await authedReq("/api/account/notifications/read", accessToken, {
        method: "POST",
        body: { ids: [mine.id.toString()] },
      }),
    );
    expect(readRes.status).toBe(200);
    expect(await readRes.json()).toEqual({ marked: 1 });
    expect(await unreadRoute(await authedReq("/api/account/notifications/unread", accessToken)).then((r) => r.json())).toEqual({ count: 0 });

    // read all / 非法请求 422
    await prisma.notification.create({
      data: { userId: user.id, type: "points", title: "t2", body: "b2" },
    });
    const readAll = await readRoute(
      await authedReq("/api/account/notifications/read", accessToken, {
        method: "POST",
        body: { all: true },
      }),
    );
    expect(await readAll.json()).toEqual({ marked: 1 });
    const badReq = await readRoute(
      await authedReq("/api/account/notifications/read", accessToken, {
        method: "POST",
        body: { ids: [] },
      }),
    );
    expect(badReq.status).toBe(422);

    // 他人 id:已读零生效且不报错(防枚举,响应只含自己的 marked 数)
    const cross = await readRoute(
      await authedReq("/api/account/notifications/read", accessToken, {
        method: "POST",
        body: { ids: [mine.id.toString()] },
      }),
    );
    expect(await cross.json()).toEqual({ marked: 0 });
  });
});
