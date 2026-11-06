import "server-only";

/**
 * 哈希并发闸(2026-11-06 撞库加固 PR-C):
 * bcrypt 是 CPU 密集操作——同步 bcryptjs 直接独占事件循环,原生 bcrypt 走 libuv 线程池。
 * 单进程内限制「同时在飞的哈希校验数」,把突发流量摊成排队而不是把事件循环打满。
 *
 * 槽位所有权直接交接:释放时唤醒队首等待者,槽位数不变——
 * 若拆成「先减后加」,两者之间后来者会超领,并发上限就形同虚设。
 */

export type HashSlot = { release: () => void };

export type HashSlotResult = { ok: true; slot: HashSlot } | { ok: false };

let inFlight = 0;
const waiting: Array<(granted: boolean) => void> = [];

/** 观测:在飞数与排队数(后台安全看板可用) */
export function hashSlotStats(): { inFlight: number; waiting: number } {
  return { inFlight, waiting: waiting.length };
}

/**
 * 取一个哈希槽位:
 * - 有空槽 → 立即拿到;
 * - 无空槽 → 排队等待,最多 waitMs 毫秒;超时则放弃(调用方回 429 SERVER_BUSY)。
 */
export async function acquireHashSlot(max: number, waitMs: number): Promise<HashSlotResult> {
  if (inFlight < max) {
    inFlight += 1;
    return { ok: true, slot: makeSlot() };
  }
  const granted = await waitForSlot(waitMs);
  if (!granted) return { ok: false };
  // 槽位所有权已由释放方交接过来,在飞数不再变化
  return { ok: true, slot: makeSlot() };
}

function waitForSlot(waitMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = waiting.indexOf(entry);
      if (idx >= 0) waiting.splice(idx, 1);
      resolve(false);
    }, waitMs);
    const entry = (granted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(granted);
    };
    waiting.push(entry);
  });
}

function makeSlot(): HashSlot {
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      const next = waiting.shift();
      if (next) {
        next(true); // 交接:队首等待者接手本槽,在飞数不变
      } else {
        inFlight -= 1;
      }
    },
  };
}
