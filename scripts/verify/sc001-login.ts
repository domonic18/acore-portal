// SC-001 验证:存量凭据登录成功率 ≥95%(quickstart S4)
// 用法:
//   1. 准备 workspace/verify-credentials.txt,每行 `用户名:密码`(# 开头为注释)
//      —— 从生产库+旧站代码导出的真实存量凭据,切勿入库(gitignore 已忽略 workspace/*)
//   2. pnpm verify:sc001
// 行为:逐条走 loginWithPassword(会真实触发透明升级),输出成功率和明细,
//      成功率 <95% 时退出码 1。建议先在 staging/本地库执行,不要直接打生产。
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../src/generated/business";
import { loginWithPassword } from "../../src/server/services/auth/login";

const CRED_FILE = path.resolve(import.meta.dirname, "../../workspace/verify-credentials.txt");
const PASS_THRESHOLD = 0.95;

async function main() {
  if (!fs.existsSync(CRED_FILE)) {
    console.error(`缺少凭据文件: ${CRED_FILE}`);
    console.error("每行一条 `用户名:密码`,由你从生产侧导出(≥20 条起步,目标 100 条)。");
    process.exit(2);
  }
  const lines = fs
    .readFileSync(CRED_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const prisma = new PrismaClient();
  let ok = 0;
  let upgraded = 0;
  const failures: string[] = [];

  try {
    for (const [i, line] of lines.entries()) {
      const sep = line.indexOf(":");
      if (sep <= 0) {
        failures.push(`#${i + 1} 格式错误(应为 用户名:密码)`);
        continue;
      }
      const username = line.slice(0, sep);
      const password = line.slice(sep + 1);
      try {
        const outcome = await loginWithPassword(username, password);
        if (outcome.ok) {
          ok += 1;
          if (outcome.upgraded) upgraded += 1;
        } else {
          failures.push(`${username} → ${outcome.failReason}`);
        }
      } catch (err) {
        failures.push(`${username} → 异常 ${(err as Error).message}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const total = lines.length;
  const rate = total > 0 ? ok / total : 0;
  console.log(`SC-001 存量凭据登录验证`);
  console.log(`  凭据总数: ${total}`);
  console.log(`  登录成功: ${ok}(其中透明升级 ${upgraded})`);
  console.log(`  失败明细:`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log(`  成功率: ${(rate * 100).toFixed(1)}%(阈值 95%)`);

  if (total === 0 || rate < PASS_THRESHOLD) {
    console.error("未达 SC-001 通过线。");
    process.exit(1);
  }
  console.log("SC-001 通过。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
