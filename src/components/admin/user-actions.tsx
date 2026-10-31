"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 用户详情操作(FR-105/FR-104):积分手调(原因必填 2-255,402=禁止负余额)
 * +徽章授予(重复 409);成功后 router.refresh。
 */
export function UserActions({
  userId,
  badges,
}: {
  userId: string;
  badges: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [badgeId, setBadgeId] = useState(badges[0]?.id ?? "");
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);

  async function adjust(sign: 1 | -1) {
    setAdjustBusy(true);
    setAdjustError(null);
    setAdjustMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/points-adjust`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: sign * (Number(amount) || 0),
          reason,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAdjustError(body?.error?.message ?? "调整失败,请稍后重试。");
        return;
      }
      setAdjustMsg(`已调整,当前余额 ${body.balance}`);
      setAmount("");
      setReason("");
      router.refresh();
    } catch {
      setAdjustError("网络异常,请稍后重试。");
    } finally {
      setAdjustBusy(false);
    }
  }

  async function grant() {
    setBadgeBusy(true);
    setBadgeError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/badges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ badgeId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setBadgeError(body?.error?.message ?? "授予失败,请稍后重试。");
        return;
      }
      router.refresh();
    } catch {
      setBadgeError("网络异常,请稍后重试。");
    } finally {
      setBadgeBusy(false);
    }
  }

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">积分手调</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-300">数量(正整数)</span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} w-32`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-gray-300">原因(2-255 字,必填)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputCls} min-w-64`}
            />
          </label>
          <button
            type="button"
            disabled={adjustBusy || !amount || reason.trim().length < 2}
            onClick={() => adjust(1)}
            className="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            增加
          </button>
          <button
            type="button"
            disabled={adjustBusy || !amount || reason.trim().length < 2}
            onClick={() => adjust(-1)}
            className="rounded bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
          >
            扣减
          </button>
        </div>
        {adjustError && (
          <p role="alert" className="text-sm text-red-400">
            {adjustError}
          </p>
        )}
        {adjustMsg && <p className="text-sm text-green-400">{adjustMsg}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">徽章授予</h2>
        {badges.length === 0 ? (
          <p className="text-sm text-gray-500">暂无可选徽章,先在后台创建徽章定义。</p>
        ) : (
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-300">徽章</span>
              <select value={badgeId} onChange={(e) => setBadgeId(e.target.value)} className={inputCls}>
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={badgeBusy || !badgeId}
              onClick={grant}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {badgeBusy ? "授予中…" : "授予"}
            </button>
          </div>
        )}
        {badgeError && (
          <p role="alert" className="text-sm text-red-400">
            {badgeError}
          </p>
        )}
      </section>
    </div>
  );
}
