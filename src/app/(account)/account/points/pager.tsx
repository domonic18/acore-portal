"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";

export type PointTx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  remark: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  register_reward: "注册奖励",
};

/** 服务端注入首页数据,翻页走 GET /api/account/points?page=(契约:客户端翻页) */
export function PointsPager({
  initial,
  page,
  totalPages,
}: {
  initial: PointTx[];
  page: number;
  totalPages: number;
}) {
  const [txs, setTxs] = useState(initial);
  const [current, setCurrent] = useState(page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(next: number) {
    if (next < 1 || next > totalPages || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/points?page=${next}`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { transactions: PointTx[]; page: number };
      setTxs(body.transactions);
      setCurrent(body.page);
    } catch {
      setError("加载失败,请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400">
            <th className="py-2">类型</th>
            <th className="py-2">变动</th>
            <th className="py-2">变动后余额</th>
            <th className="py-2">时间</th>
          </tr>
        </thead>
        <tbody>
          {txs.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-gray-400">
                暂无积分流水。
              </td>
            </tr>
          ) : (
            txs.map((t) => (
              <tr key={t.id} className="border-b border-gray-900">
                <td className="py-2">{t.remark ?? TYPE_LABEL[t.type] ?? t.type}</td>
                <td className={`py-2 ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount}
                </td>
                <td className="py-2 text-gray-300">{t.balanceAfter}</td>
                <td className="py-2 text-gray-400">{formatDateTime(t.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current <= 1 || loading}
            className="rounded border border-gray-700 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-gray-400">
            第 {current} / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current >= totalPages || loading}
            className="rounded border border-gray-700 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
