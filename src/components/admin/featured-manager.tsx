"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

export type FeaturedProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string | null;
  featuredSort: number;
  /** 非上架/目录隐藏:仍列出但首页查询会过滤,标警示 */
  offShelf: boolean;
};

export type FeaturedCandidate = { id: string; name: string; sku: string; price: number };

/**
 * 首页精选商品管理(/admin/home):加入/移出/上下移。
 * 重排按整份清单全量重写 featured_sort(子集重写会让顺序静默打乱,服务端亦拒)。
 */
export function FeaturedManager({
  products,
  candidates,
}: {
  products: FeaturedProduct[];
  candidates: FeaturedCandidate[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [order, setOrder] = useState<string[]>(() => products.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const busyRef = useRef(false);

  // refresh 后与 props 对齐(props 即服务端权威顺序)
  const propsOrder = products.map((p) => p.id).join(",");
  useEffect(() => {
    setOrder(propsOrder ? propsOrder.split(",") : []);
  }, [propsOrder]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = order.map((id) => byId.get(id)).filter((p): p is FeaturedProduct => Boolean(p));

  async function persist(next: string[], request: () => Promise<unknown>) {
    if (busyRef.current || !hydrated) return;
    busyRef.current = true;
    setBusy(true);
    setOrder(next); // 乐观落地;失败回滚为服务端序
    try {
      await request();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setOrder(products.map((p) => p.id));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const reorder = (next: string[]) =>
    persist(next, () =>
      requestJson("/api/admin/home/featured", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: next }),
      }),
    );

  const move = (id: string, delta: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    reorder(next);
  };

  const remove = (id: string) =>
    persist(
      order.filter((x) => x !== id),
      () => requestJson(`/api/admin/home/featured?productId=${id}`, { method: "DELETE" }),
    );

  const add = () => {
    if (!candidateId) return;
    void persist(order, () =>
      requestJson("/api/admin/home/featured", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: candidateId }),
      }),
    ).then(() => setCandidateId(""));
  };

  const disabled = busy || !hydrated;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">精选商品</h2>
        <p className="mt-1 text-sm text-[#93b2ce]">
          首页右栏「精选商品」区仅登录用户可见,展示下列顺序的前 4 件;不足 4 件时以最新上架商品补位。
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-[#7f4a5a] bg-[#2a1a24] px-3 py-2 text-sm text-[#eda9a9]">
          {error}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="选择商品"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            disabled={disabled}
            className={`min-w-[280px] flex-1 rounded-lg border border-[#22385a] bg-[#0b1526] px-3 py-2 text-sm text-[#dcebf7] ${FOCUS_RING}`}
          >
            <option value="">选择要加入精选的商品(已上架且目录可见)…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}({c.price} 积分)
              </option>
            ))}
          </select>
          <Button type="button" variant="primary" disabled={disabled || !candidateId} onClick={add}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            加入精选
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-4 py-8 text-center text-sm text-[#6482a3]">
          暂无精选商品;首页将展示最新上架的商品作为回退。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p, index) => (
            <li
              key={p.id}
              data-testid="featured-row"
              data-name={p.name}
              className="flex items-center gap-3 rounded-xl border border-[#22385a] bg-[#13233a] px-3 py-2.5"
            >
              <span className="w-5 shrink-0 text-right text-xs text-[#6482a3]">{index + 1}</span>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt={p.name}
                  className="h-10 w-16 shrink-0 rounded-md border border-[#22385a] object-cover"
                />
              ) : (
                <span className="h-10 w-16 shrink-0 rounded-md border border-dashed border-[#22385a]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#dcebf7]">{p.name}</p>
                <p className="text-xs text-[#6482a3]">
                  {p.price} 积分
                  {p.offShelf && (
                    <span className="ml-1.5 rounded-full border border-[#7f4a5a] px-1.5 py-0.5 text-[11px] text-[#eda9a9]">
                      未上架,首页不显示
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || index === 0}
                  aria-label={`上移「${p.name}」`}
                  onClick={() => move(p.id, -1)}
                >
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || index === rows.length - 1}
                  aria-label={`下移「${p.name}」`}
                  onClick={() => move(p.id, 1)}
                >
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => remove(p.id)}
                >
                  移出精选
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
