"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaFiles } from "./media-library";

/**
 * 渐进计划节点管理(T048 契约补全 api-admin-m3):
 * 列表(日期 NULLS LAST+isCurrent 指针标记)+新建/编辑表单+行内删除(指针节点二次确认提示)。
 * 配图走媒体库上传(multipart /api/admin/media,FR-217)回填 URL,可清除;
 * 图标为自由 emoji(前台时间轴中线展示,空=默认圆点)。
 * 类型就地声明(boundaries:components 禁 import server;与 services 返回结构同构)。
 */
export type AdminProgressionNode = {
  id: string;
  title: string;
  phaseDate: string | null;
  imageUrl: string | null;
  bodyMd: string | null;
  status: string;
  icon: string | null;
  sort: number;
  isCurrent: boolean;
};
export function ProgressionAdmin({ nodes }: { nodes: AdminProgressionNode[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null); // null=新建态关闭
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function emptyForm() {
    return { title: "", phaseDate: "", imageUrl: "", bodyMd: "", status: "locked" as "locked" | "open", icon: "", sort: 0 };
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setSaved(false);
  }

  function startEdit(node: AdminProgressionNode) {
    setEditingId(node.id);
    setForm({
      title: node.title,
      phaseDate: node.phaseDate ?? "",
      imageUrl: node.imageUrl ?? "",
      bodyMd: node.bodyMd ?? "",
      status: node.status === "open" ? "open" : "locked",
      icon: node.icon ?? "",
      sort: node.sort,
    });
    setError(null);
    setSaved(false);
  }

  async function uploadImage(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const [asset] = await uploadMediaFiles([...files]);
      if (asset) setForm((f) => ({ ...f, imageUrl: asset.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败,请稍后重试。");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!form.title.trim()) {
      setError("标题必填。");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(
        editingId ? `/api/admin/progression/${editingId}` : "/api/admin/progression",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            phaseDate: form.phaseDate || null,
            imageUrl: form.imageUrl || null,
            bodyMd: form.bodyMd || null,
            status: form.status,
            icon: form.icon.trim() || null,
            sort: form.sort,
          }),
        },
      );
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "保存失败。");
        return;
      }
      setSaved(true);
      setEditingId(null);
      setForm(emptyForm());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(node: AdminProgressionNode) {
    const tip = node.isCurrent
      ? `「${node.title}」是当前阶段指针节点,删除将同时清除指针(前台回退末位开放阶段)。确认删除?`
      : `确认删除渐进节点「${node.title}」?`;
    if (!window.confirm(tip)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/progression/${node.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded border border-gray-800 p-4 text-sm">
        <h2 className="mb-3 font-semibold text-gray-200">
          {editingId ? "编辑节点" : "新建节点"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            标题
            <input
              data-testid="progression-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
              maxLength={128}
            />
          </label>
          <label className="flex flex-col gap-1">
            阶段日期(留空=未定档)
            <input
              data-testid="progression-date"
              type="date"
              value={form.phaseDate}
              onChange={(e) => setForm({ ...form, phaseDate: e.target.value })}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            状态
            <select
              data-testid="progression-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value === "open" ? "open" : "locked" })}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
            >
              <option value="locked">未开放</option>
              <option value="open">开放</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            排序(同日期稳定序)
            <input
              data-testid="progression-sort"
              type="number"
              min={0}
              max={9999}
              value={form.sort}
              onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            节点图标(可选,emoji)
            <input
              data-testid="progression-icon"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
              placeholder="如 ⚔️ 🛡️ 🐉,留空=默认圆点"
              maxLength={64}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span>配图(可选)</span>
            <div className="flex items-center gap-2">
              <input
                data-testid="progression-image"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1"
                placeholder="上传或粘贴图片 URL"
                maxLength={500}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadImage(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="shrink-0 rounded border border-gray-600 px-3 py-1 text-gray-200 hover:border-gray-400 disabled:opacity-50"
              >
                上传
              </button>
              {form.imageUrl && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, imageUrl: "" })}
                  disabled={busy}
                  className="shrink-0 text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  清除
                </button>
              )}
            </div>
            {form.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.imageUrl}
                alt="配图预览"
                className="mt-1 h-24 w-40 rounded border border-gray-700 object-cover"
              />
            )}
          </div>
          <label className="flex flex-col gap-1 md:col-span-2">
            说明 Markdown(可选)
            <textarea
              data-testid="progression-body"
              value={form.bodyMd}
              onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
              rows={4}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1"
            />
          </label>
        </div>
        {error && <p data-testid="progression-error" className="mt-2 text-sm text-red-400">{error}</p>}
        {saved && <p className="mt-2 text-sm text-green-400">已保存,即时生效。</p>}
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            data-testid="progression-save"
            onClick={submit}
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {editingId ? "保存修改" : "新建节点"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={startCreate}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              取消编辑
            </button>
          )}
        </div>
      </section>

      {nodes.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          暂无渐进节点。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">标题</th>
              <th className="py-2 pr-3 font-normal">日期</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">排序</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-b border-gray-900">
                <td className="py-2 pr-3">
                  {n.icon && <span className="mr-1">{n.icon}</span>}
                  {n.title}
                  {n.imageUrl && <span className="ml-2 text-xs text-gray-500">图</span>}
                  {n.isCurrent && (
                    <span className="ml-2 rounded bg-green-950 px-2 py-0.5 text-xs text-green-400">
                      当前阶段
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-gray-400">{n.phaseDate ?? "未定档"}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      n.status === "open"
                        ? "bg-green-950 text-green-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {n.status === "open" ? "开放" : "未开放"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-400">{n.sort}</td>
                <td className="flex gap-3 py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => startEdit(n)}
                    className="text-blue-400 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    disabled={busy}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
