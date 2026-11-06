// 撞库事故后对被撞账号强制改密(2026-11-06 加固 PR-0):
// 复用既有重置原语签发一次性重置链接 + 邮件通知,吊销全部会话(杀掉攻击者手上的会话),
// 不直接写哈希——用户自行走重置流程,由站点双写游戏端(守住铁律 #2)。
// 用法:pnpm ops:force-password-reset -- --user alice --user bob
//       pnpm ops:force-password-reset -- --file workspace/compromised-users.txt --dry-run
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { getConfig } from "../../src/lib/config";
import { prisma } from "../../src/lib/db";
import { TOKEN_TYPE } from "../../src/constants/token";
import { MAIL_STATUS, MAIL_TEMPLATE } from "../../src/constants/mail";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";
import { writeAudit } from "../../src/server/services/shared/audit";
import { drainOutbox, enqueueMail } from "../../src/server/services/shared/mail-outbox";
import { issueUserToken } from "../../src/server/services/shared/user-token";
import { revokeEverything } from "../../src/server/services/auth/password/shared";

const DEFAULT_TTL_HOURS = 24;

const { values } = parseArgs({
  options: {
    user: { type: "string", multiple: true, default: [] },
    file: { type: "string" },
    "ttl-hours": { type: "string", default: String(DEFAULT_TTL_HOURS) },
    "print-link": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    operator: { type: "string", default: "ops" },
  },
  allowPositionals: false,
});

async function readUsernames(): Promise<string[]> {
  const list = [...values.user];
  if (values.file) {
    const raw = await readFile(values.file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const name = line.trim();
      if (name && !name.startsWith("#")) list.push(name);
    }
  }
  return [...new Set(list.map((n) => n.trim()).filter(Boolean))];
}

async function drainAll(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const pending = await prisma.mailOutbox.count({
      where: { status: MAIL_STATUS.PENDING },
    });
    if (pending === 0) return;
    await drainOutbox(50);
  }
}

async function main() {
  const usernames = await readUsernames();
  if (usernames.length === 0) {
    console.error("[force-password-reset] 未指定账号:用 --user <用户名> 或 --file <文件>");
    process.exitCode = 2;
    return;
  }

  const ttlHours = Number(values["ttl-hours"]);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    console.error("[force-password-reset] --ttl-hours 必须是正数");
    process.exitCode = 2;
    return;
  }
  const ttlSec = Math.round(ttlHours * 3600);
  const operator = values.operator;
  const { app } = await getConfig();

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const links: string[] = [];
  const processedIds: bigint[] = [];

  for (const username of usernames) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true, status: true },
    });
    if (!user) {
      console.error(`[force-password-reset] 跳过:用户不存在 ${username}`);
      skipped++;
      continue;
    }
    if (user.status === "banned") {
      console.error(`[force-password-reset] 跳过:账号已封禁 ${username}`);
      skipped++;
      continue;
    }

    if (values["dry-run"]) {
      console.log(`[force-password-reset] (dry-run) 将对 ${username} 强制改密`);
      continue;
    }

    try {
      const { plain } = await prisma.$transaction(async (tx) => {
        const issued = await issueUserToken(tx, {
          userId: user.id,
          type: TOKEN_TYPE.PASSWORD_RESET,
          ttlSec,
        });
        await enqueueMail(tx, {
          to: user.email,
          template: MAIL_TEMPLATE.PASSWORD_RESET,
          payload: {
            username: user.username,
            link: `${app.url}/reset-password?token=${issued.plain}`,
          },
          relatedUserId: user.id,
        });
        return issued;
      });

      // 杀掉攻击者手上的会话与 refresh token
      await revokeEverything(user.id);

      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.PASSWORD_RESET,
        actorUserId: user.id,
        payload: { stage: "forced_by_operator", operator, ttlHours },
      });

      links.push(`${username}\t${app.url}/reset-password?token=${plain}`);
      processedIds.push(user.id);
      done++;
      console.log(`[force-password-reset] ${username}:已签发重置链接并吊销全部会话`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[force-password-reset] ${username}:失败 ${message}`);
    }
  }

  if (!values["dry-run"] && done > 0) {
    await drainAll();
    const failedMails = await prisma.mailOutbox.count({
      where: { status: MAIL_STATUS.FAILED, relatedUserId: { in: processedIds } },
    });
    if (failedMails > 0) {
      console.error(
        `[force-password-reset] 注意:outbox 中有 ${failedMails} 封失败邮件,需在后台重发`,
      );
    }
  }

  if (values["print-link"] && links.length > 0) {
    console.log("[force-password-reset] 重置链接(仅供人工投递,勿写入日志/审计):");
    for (const line of links) console.log(line);
  }

  console.log(
    `[force-password-reset] 完成:处理=${done} 跳过=${skipped} 失败=${failed}` +
      (values["dry-run"] ? " (dry-run,未做任何变更)" : ""),
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
