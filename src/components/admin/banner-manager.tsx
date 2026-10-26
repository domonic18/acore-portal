"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaAssetList, uploadMediaFiles } from "@/components/admin/media-library";
import { useHydrated } from "@/lib/use-hydrated";

type Banner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  sort: number;
  enabled: boolean;
};

type Draft = { title: string; imageUrl: string; linkUrl: string; sort: string; enabled: boolean };

const EMPTY: Draft = { title: "", imageUrl: "", linkUrl: "", sort: "0", enabled: true };

/** 图片字段:手填 + 媒体库选图(上传/选择复用媒体库) */
function ImageField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/images/… 或 https://…"
          className="w-72 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400 disabled:opacity-50"
        >
          {open ? "收起媒体库" : "从媒体库选图"}
        </button>
      </div>
      {open && (
        <div className="rounded border border-gray-700 p-2">
          <div className="mb-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading || disabled}
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                setUploading(true);
                setUploadError(null);
                try {
                  const uploaded = await uploadMediaFiles(Array.from(files));
                  onChange(uploaded[0]?.url ?? value);
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : "上传失败");
                } finally {
                  setUploading(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
              className="text-xs text-gray-300"
            />
            {uploading && <span className="text-xs text-gray-400">上传中…</span>}
            {uploadError && (
              <span role="alert" className="text-xs text-red-400">
                {uploadError}
              </span>
            )}
          </div>
          <MediaAssetList
            refreshKey={refreshKey}
            onPick={(asset) => {
              onChange(asset.url);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** 轮播物料管理:新建/行内编辑(全量提交)/启停/删除;图片走媒体库 */
export function BannerManager({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [newBanner, setNewBanner] = useState<Draft>(EMPTY);

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white";

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const resp = await res.json().catch(() => null);
        setError(resp?.error?.message ?? "操作失败,请稍后重试。");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("网络异常,请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toPayload(d: Draft) {
    return {
      title: d.title,
      imageUrl: d.imageUrl,
      linkUrl: d.linkUrl.trim(),
      sort: Number(d.sort) || 0,
      enabled: d.enabled,
    };
  }

  function startEdit(b: Banner) {
    setEditingId(b.id);
    setDraft({
      title: b.title,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
      sort: String(b.sort),
      enabled: b.enabled,
    });
  }

  function editorFields(d: Draft, setD: (updater: (prev: Draft) => Draft) => void) {
    return (
      <>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          标题
          <input
            required
            value={d.title}
            onChange={(e) => setD((p) => ({ ...p, title: e.target.value }))}
            className={`${inputCls} w-44`}
          />
        </label>
        <span className="flex flex-col gap-1 text-xs text-gray-300">
          图片
          <ImageField value={d.imageUrl} onChange={(url) => setD((p) => ({ ...p, imageUrl: url }))} disabled={busy || !hydrated} />
        </span>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          跳转链接(可空)
          <input
            value={d.linkUrl}
            onChange={(e) => setD((p) => ({ ...p, linkUrl: e.target.value }))}
            placeholder="https://…"
            className={`${inputCls} w-56`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          排序
          <input
            type="number"
            value={d.sort}
            onChange={(e) => setD((p) => ({ ...p, sort: e.target.value }))}
            className={`${inputCls} w-16`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={d.enabled}
            onChange={(e) => setD((p) => ({ ...p, enabled: e.target.checked }))}
          />
          启用
        </label>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">轮播物料</h2>
        <button
          type="button"
          disabled={!hydrated}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          onClick={() => {
            setCreating((v) => !v);
            setNewBanner(EMPTY);
          }}
        >
          {creating ? "收起新建" : "新建物料"}
        </button>
      </div>

      {creating && (
        <form
          className="flex flex-wrap items-end gap-3 rounded border border-gray-700 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send("POST", "/api/admin/banners", toPayload(newBanner)).then((ok) => {
              if (ok) {
                setCreating(false);
                setNewBanner(EMPTY);
              }
            });
          }}
        >
          {editorFields(newBanner, setNewBanner)}
          <button
            type="submit"
            disabled={busy || !hydrated}
            className="rounded bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            创建
          </button>
        </form>
      )}

      {banners.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-8 text-center text-gray-400">
          暂无轮播物料;首页轮播位在存在启用物料时展示。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">预览</th>
              <th className="py-2 pr-3 font-normal">标题</th>
              <th className="py-2 pr-3 font-normal">跳转</th>
              <th className="py-2 pr-3 font-normal">排序</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {banners.map((b) =>
              editingId === b.id ? (
                <tr key={b.id} className="border-b border-gray-900">
                  <td colSpan={6} className="py-3 pr-3">
                    <div className="flex flex-wrap items-end gap-3">
                      {editorFields(draft, setDraft)}
                      <button
                        type="button"
                        disabled={busy || !hydrated}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                        onClick={() =>
                          void send("PUT", `/api/admin/banners/${b.id}`, toPayload(draft)).then((ok) => {
                            if (ok) setEditingId(null);
                          })
                        }
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={b.id} className="border-b border-gray-900">
                  <td className="py-2 pr-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.imageUrl} alt={b.title} className="h-10 w-24 rounded object-cover" />
                  </td>
                  <td className="py-2 pr-3">{b.title}</td>
                  <td className="max-w-[16rem] truncate py-2 pr-3 text-xs text-gray-400">
                    {b.linkUrl || "—"}
                  </td>
                  <td className="py-2 pr-3 text-gray-400">{b.sort}</td>
                  <td className="py-2 pr-3">
                    {b.enabled ? (
                      <span className="text-green-400">启用</span>
                    ) : (
                      <span className="text-gray-500">停用</span>
                    )}
                  </td>
                  <td className="flex flex-wrap gap-1 py-2 pr-3">
                    <button
                      type="button"
                      disabled={busy || !hydrated}
                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400 disabled:opacity-50"
                      onClick={() => startEdit(b)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={busy || !hydrated}
                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400 disabled:opacity-50"
                      onClick={() =>
                        void send("PUT", `/api/admin/banners/${b.id}`, {
                          title: b.title,
                          imageUrl: b.imageUrl,
                          linkUrl: b.linkUrl,
                          sort: b.sort,
                          enabled: !b.enabled,
                        })
                      }
                    >
                      {b.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !hydrated}
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
                      onClick={() => {
                        if (!window.confirm(`确认删除轮播物料「${b.title}」?`)) return;
                        void send("DELETE", `/api/admin/banners/${b.id}`);
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
