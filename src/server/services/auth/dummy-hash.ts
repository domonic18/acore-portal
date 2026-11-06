import "server-only";
import { randomBytes } from "node:crypto";
import { hashWpBcrypt, verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";

/**
 * 对照假哈希(PR-E 时序枚举闭合):
 * 「用户名不存在」原本直接返回(~2ms),「密码错误」要跑完一次 bcrypt
 * (原生实现 cost 12 实测约 220ms)——这两百多毫秒的差就是撞库前的免费用户名清单。
 *
 * 做法:进程内生成一条随机密码的 bcrypt 哈希(cost 与真实校验同档),
 * 在「没有真实校验可跑」的分支上拿它做一次等成本比对,返回值丢弃,
 * 只把墙钟时间拉齐。哈希不入库、不跨进程共享,进程启动后首次用到时生成。
 *
 * 已知:假哈希懒生成 → 进程内**首个**走本函数的请求额外多付一次签发哈希
 * (约 +220ms),该请求墙钟约为稳态的两倍。撞库流量拿到的都是稳态,
 * 信道价值可忽略;要彻底收敛可在进程启动时预生成一条。
 */
let pending: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  pending ??= hashWpBcrypt(randomBytes(32).toString("hex"));
  return pending;
}

/**
 * 拉平耗时:调用方忽略结果,只为对齐墙钟时间。
 * 凡是「本次登录没有跑过真实哈希校验」的分支都必须调用它,
 * 否则该分支会成为比密码错误更快的信道。
 */
export async function burnTiming(password: string): Promise<void> {
  await verifyWpBcrypt(password, await getDummyHash());
}
