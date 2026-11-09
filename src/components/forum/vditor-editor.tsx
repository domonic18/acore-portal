"use client";

import { useEffect, useRef, type RefObject } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { requestJson, errorMessage } from "@/lib/api-client";
import {
  FORUM_TEXT_PALETTE,
  forumPaletteClass,
  forumPaletteSwatchIcon,
  type ForumPaletteKey,
} from "@/constants/forum-palette";

const MAX_CONTENT = 20_000;

/** 文字颜色组(受限色板)。子项必须走自定义 click:IR 模式的 processToolbar 只认
 * 固定命令名(bold/italic/…),prefix/suffix 对未知命令名直接落空不插入。click 的
 * vditor 参数是内部 IVditor(无原型方法),经组件 ref 拿公共实例,取选区文本后
 * insertMD(经 Lute Md2VditorIRDOM)包裹类标记并替换选区 */
function colorToolbarItem(vdRef: RefObject<Vditor | null>) {
  return {
    name: "forum-color",
    tip: "文字颜色",
    click: () => {},
    icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 3a9 9 0 0 0 0 18c1.4 0 2.2-.9 2.2-2 0-1.2-.9-1.7-.9-2.6 0-.8.7-1.4 1.6-1.4h1.9c2.4 0 4.2-1.8 4.2-4.2C21 6.3 17 3 12 3Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2-3.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>`,
    toolbar: FORUM_TEXT_PALETTE.map((c) => ({
      name: `forum-c-${c.key}`,
      tip: c.label,
      icon: forumPaletteSwatchIcon(c.color),
      click: () => {
        const vd = vdRef.current;
        if (!vd) return;
        const selected = vd.getSelection() ?? "";
        const safe = selected
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        vd.insertMD(`<span class="${forumPaletteClass(c.key as ForumPaletteKey)}">${safe}</span>`);
      },
    })),
  };
}

/**
 * 论坛正文编辑器(Vditor IR 即时渲染,Typora 式编辑即所见):
 * - 代码层仍是纯 Markdown,与后端 contentHtml 契约/renderMarkdown 管线零改动;
 * - 运行时资产自托管 cdn:"/vditor"(dev/build 脚本链拷贝,禁 unpkg 默认源);
 * - 编辑区关闭 Lute sanitize(受限色板靠内联 span 类标记渲染;XSS 真闸门
 *   在服务端 rehype-sanitize 白名单,不在编辑器);
 * - 图片上传接管 upload.handler:工具栏按钮/粘贴/拖拽统一走 /api/forum/upload。
 */
export function VditorEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const vdRef = useRef<Vditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readyRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const host = elRef.current;
    if (!host) return;
    // 每个挂载周期独立子节点:StrictMode 双挂载时旧实例(未就绪无法 destroy)的
    // 半初始化 DOM 随宿主子节点整体移除,不污染/误清新实例(vditor destroy 会
    // 清空挂载元素 innerHTML,共享同一 el 会互相抹掉)
    const mount = document.createElement("div");
    host.appendChild(mount);
    let ready = false;
    const vd = new Vditor(mount, {
      cdn: "/vditor",
      mode: "ir",
      lang: "zh_CN",
      theme: "dark",
      icon: "ant",
      cache: { enable: false },
      counter: { enable: true, max: MAX_CONTENT, type: "markdown" },
      placeholder,
      height: Math.max(rows * 34, 200),
      value,
      input: (v) => onChangeRef.current(v.slice(0, MAX_CONTENT)),
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "|",
        "list",
        "ordered-list",
        "check",
        "quote",
        "|",
        "link",
        "table",
        "inline-code",
        "code",
        "|",
        colorToolbarItem(vdRef),
        "upload",
        "|",
        "undo",
        "redo",
        "fullscreen",
      ],
      preview: { markdown: { sanitize: false } },
      upload: {
        accept: "image/*",
        multiple: true,
        handler: async (files: File[]) => {
          if (files.length === 0) return null;
          try {
            const fd = new FormData();
            for (const f of files) fd.append("files", f);
            const body = await requestJson<{ items: { url: string; originalName: string }[] }>(
              "/api/forum/upload",
              { method: "POST", body: fd },
            );
            for (const item of body.items) {
              vdRef.current?.insertValue(`\n![${item.originalName}](${item.url})\n`);
            }
          } catch (err) {
            vdRef.current?.tip(`图片上传失败:${errorMessage(err)}`, 3000);
          }
          return null;
        },
      },
      after: () => {
        // 初始化完成闸门:此前 getValue/setValue 都会因内部态未就绪抛错。
        // 旧实例迟到的 after 一律忽略(只认当前存活实例)
        if (vdRef.current !== vd) return;
        ready = true;
        readyRef.current = true;
        if (vd.getValue() !== valueRef.current) {
          vd.setValue(valueRef.current);
        }
      },
    });
    vdRef.current = vd;
    return () => {
      if (ready) vd.destroy();
      if (vdRef.current === vd) {
        vdRef.current = null;
        readyRef.current = false;
      }
      mount.remove();
    };
    // 初始化只跑一次:placeholder/rows 由外层按帖型固定,不随打字重挂
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 受控同步:外部 value 变化(回帖成功清空)且与编辑器内容不一致时回写;
  // 仅在编辑器初始化完成后执行(after 前调用实例方法会抛错)
  useEffect(() => {
    const vd = vdRef.current;
    if (readyRef.current && vd && vd.getValue() !== value) vd.setValue(value, true);
  }, [value]);

  return <div ref={elRef} className="vditor-forum" />;
}
