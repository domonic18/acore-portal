"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";
import { PRODUCT_FAQ_LIMITS } from "@/constants/shop";

/**
 * 商品 FAQ 后台管理(#159):新增 / 逐条编辑 / 删除 / 上下移排序。
 * 列表数据来自服务端(props),每次写操作后 router.refresh() 拉回最新顺序;
 * 行内草稿按行独立保存,失败不丢草稿。
 */
export type AdminProductFaqItem = {
  id: string;
  question: string;
  answer: string;
};

function apiBase(productId: string): string {
  return `/api/admin/products/${productId}/faq`;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function FaqRow({
  productId,
  faq,
  index,
  total,
  onMove,
}: {
  productId: string;
  faq: AdminProductFaqItem;
  index: number;
  total: number;
  onMove: (index: number, delta: number) => void;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await requestJson(`${apiBase(productId)}/${faq.id}`, jsonInit("PATCH", { question, answer }));
      setNotice("已保存");
      router.refresh();
    });

  const remove = () =>
    run(async () => {
      await requestJson(`${apiBase(productId)}/${faq.id}`, jsonInit("DELETE"));
      router.refresh();
    });

  return (
    <li
      data-testid={`product-faq-row-${faq.id}`}
      className="flex flex-col gap-2 rounded-lg border border-[#22385a] bg-[#0b1526] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-[#6482a3]">第 {index + 1} 条</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || index === 0}
            onClick={() => onMove(index, -1)}
          >
            上移
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            下移
          </Button>
        </div>
      </div>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11.5px] text-[#6482a3]">问题</span>
        <Input
          value={question}
          maxLength={PRODUCT_FAQ_LIMITS.questionMax}
          aria-label={`问题(第 ${index + 1} 条)`}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[11.5px] text-[#6482a3]">答案</span>
        <Textarea
          rows={4}
          value={answer}
          maxLength={PRODUCT_FAQ_LIMITS.answerMax}
          aria-label={`答案(第 ${index + 1} 条)`}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>

      {error && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </p>
      )}
      {notice && <p className="text-xs text-[#6ee7b7]">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="primary" disabled={busy} onClick={save}>
          保存修改
        </Button>
        <Button type="button" size="sm" variant="danger" disabled={busy} onClick={remove}>
          删除
        </Button>
      </div>
    </li>
  );
}

export function ProductFaqManager({
  productId,
  initialFaqs,
}: {
  productId: string;
  initialFaqs: AdminProductFaqItem[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson(apiBase(productId), jsonInit("POST", { question, answer }));
      setQuestion("");
      setAnswer("");
      setNotice("已新增");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const ids = initialFaqs.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const swapped = [...ids];
    const moved = swapped[index];
    const displaced = swapped[target];
    if (moved === undefined || displaced === undefined) return;
    swapped[index] = displaced;
    swapped[target] = moved;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson(apiBase(productId), jsonInit("PUT", { ids: swapped }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg border border-[#22385a] bg-[#0b1526] p-3">
        <h2 className="text-sm font-semibold">新增常见问题</h2>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11.5px] text-[#6482a3]">问题</span>
          <Input
            value={question}
            maxLength={PRODUCT_FAQ_LIMITS.questionMax}
            aria-label="新增问题"
            placeholder="例如:发货后多久能到账?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11.5px] text-[#6482a3]">答案</span>
          <Textarea
            rows={3}
            value={answer}
            maxLength={PRODUCT_FAQ_LIMITS.answerMax}
            aria-label="新增答案"
            placeholder="用户在商品详情页看到的内容"
            onChange={(e) => setAnswer(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-[#eda9a9]">
            {error}
          </p>
        )}
        {notice && <p className="text-xs text-[#6ee7b7]">{notice}</p>}
        <div>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !question.trim() || !answer.trim()}
            onClick={create}
          >
            新增
          </Button>
        </div>
      </section>

      {initialFaqs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#22385a] px-4 py-6 text-center text-sm text-[#6482a3]">
          该商品还没有常见问题。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialFaqs.map((faq, i) => (
            <FaqRow
              key={faq.id}
              productId={productId}
              faq={faq}
              index={i}
              total={initialFaqs.length}
              onMove={move}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
