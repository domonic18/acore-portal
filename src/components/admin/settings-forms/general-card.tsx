"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage, requestJson } from "@/lib/api-client";
import type { SettingsView } from "@/lib/settings-types";

/**
 * 常规设置整卡(2026-11-19 用户反馈:分组小卡太碎,一页十几个卡片看不清)
 *
 * 形态:一张卡内分五个分区(站点地址/站点信息/内容展示/站点外观/外部工具站),
 * 每个分区一行式字段(左标签+说明、右控件),**底部吸底唯一保存条**。
 *
 * 保存口径:五个分区一次提交(逐组 PUT,顺序提交——服务端每次落库后即重载
 * config 快照,顺序提交才能保证最后一次快照含全部分区的新值);
 * 任一分区失败即整体回显错误。
 */

type GeneralView = Pick<SettingsView, "app" | "site" | "content" | "appearance" | "tools">;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={`settings-section-${id}`} className="border-t border-line px-4 py-4 first:border-t-0">
      <h2 className="text-[13.5px] font-semibold text-heading">{title}</h2>
      <p className="mt-0.5 mb-3 text-[11.5px] leading-relaxed text-muted">{description}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[250px_minmax(0,1fr)] sm:gap-4">
      <div>
        <div className="text-[12.5px] font-semibold text-heading">{label}</div>
        {hint ? <div className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function GeneralSettingsCard({ view }: { view: GeneralView }) {
  const router = useRouter();
  const [url, setUrl] = useState(view.app.url);
  const [name, setName] = useState(view.site.name);
  const [tagline, setTagline] = useState(view.site.tagline);
  const [icp, setIcp] = useState(view.site.icp);
  const [copyrightEn, setCopyrightEn] = useState(view.site.copyrightEn);
  const [qqGroup, setQqGroup] = useState(view.site.qqGroup);
  const [qqGroupQr, setQqGroupQr] = useState(view.site.qqGroupQr);
  const [qqGroupJoinUrl, setQqGroupJoinUrl] = useState(view.site.qqGroupJoinUrl);
  const [tocEnabled, setTocEnabled] = useState(view.content.tocEnabled);
  const [logoUrl, setLogoUrl] = useState(view.appearance.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(view.appearance.faviconUrl);
  const [headerBackgroundUrl, setHeaderBackgroundUrl] = useState(view.appearance.headerBackgroundUrl);
  const [pageBackgroundUrl, setPageBackgroundUrl] = useState(view.appearance.pageBackgroundUrl);
  const [rankBase, setRankBase] = useState(view.tools.rankBase);
  const [dkpUrl, setDkpUrl] = useState(view.tools.dkpUrl);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      url !== view.app.url ||
      name !== view.site.name ||
      tagline !== view.site.tagline ||
      icp !== view.site.icp ||
      copyrightEn !== view.site.copyrightEn ||
      qqGroup !== view.site.qqGroup ||
      qqGroupQr !== view.site.qqGroupQr ||
      qqGroupJoinUrl !== view.site.qqGroupJoinUrl ||
      tocEnabled !== view.content.tocEnabled ||
      logoUrl !== view.appearance.logoUrl ||
      faviconUrl !== view.appearance.faviconUrl ||
      headerBackgroundUrl !== view.appearance.headerBackgroundUrl ||
      pageBackgroundUrl !== view.appearance.pageBackgroundUrl ||
      rankBase !== view.tools.rankBase ||
      dkpUrl !== view.tools.dkpUrl,
    [view, url, name, tagline, icp, copyrightEn, qqGroup, qqGroupQr, qqGroupJoinUrl, tocEnabled, logoUrl, faviconUrl, headerBackgroundUrl, pageBackgroundUrl, rankBase, dkpUrl],
  );

  async function save() {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    const groups: { group: string; values: Record<string, unknown> }[] = [
      { group: "app", values: { url } },
      {
        group: "site",
        values: { name, tagline, icp, copyrightEn, qqGroup, qqGroupQr, qqGroupJoinUrl },
      },
      { group: "content", values: { tocEnabled } },
      { group: "appearance", values: { logoUrl, faviconUrl, headerBackgroundUrl, pageBackgroundUrl } },
      {
        group: "tools",
        // 两个地址都有默认值(config 缺省回落到线上工具站),不存在「未配置」态,
        // 故留空=保持现值,不落空串(否则 schema 判非法 URL)
        values: {
          rankBase: rankBase.trim() === "" ? undefined : rankBase.trim(),
          dkpUrl: dkpUrl.trim() === "" ? undefined : dkpUrl.trim(),
        },
      },
    ];
    try {
      for (const item of groups) {
        await requestJson("/api/admin/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item),
        });
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="settings-group-general" className="rounded-xl border border-line bg-panel-strong">
      <Section
        id="app"
        title="站点地址"
        description="站点对外访问地址(生产与测试环境各自不同);MCP 接入示例中的服务地址由它派生"
      >
        <Row label="站点 URL" hint="含协议,不带尾斜杠">
          <Input
            data-testid="settings-field-app-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://lokta.cn"
          />
        </Row>
      </Section>

      <Section
        id="site"
        title="站点信息"
        description="页脚站点名/副标题/备案/版权与侧栏 QQ 交流群;副标题/备案号/版权声明/群号留空 = 前台对应元素不显示"
      >
        <Row label="站点名">
          <Input
            data-testid="settings-field-site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="老克塔 LoktaCN"
          />
        </Row>
        <Row label="站点副标题" hint="怀旧公益项目(非营利,留空隐藏)">
          <Input
            data-testid="settings-field-site-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </Row>
        <Row label="ICP 备案号" hint="京ICP备…(留空隐藏)">
          <Input
            data-testid="settings-field-site-icp"
            value={icp}
            onChange={(e) => setIcp(e.target.value)}
          />
        </Row>
        <Row label="英文版权声明" hint="页脚版权行(留空隐藏)">
          <Textarea
            data-testid="settings-field-site-copyrightEn"
            value={copyrightEn}
            onChange={(e) => setCopyrightEn(e.target.value)}
            rows={3}
          />
        </Row>
        <Row label="QQ 交流群号" hint="侧栏「官方交流群」卡(留空隐藏)">
          <Input
            data-testid="settings-field-site-qqGroup"
            value={qqGroup}
            onChange={(e) => setQqGroup(e.target.value)}
          />
        </Row>
        <Row label="QQ 群二维码图" hint="侧栏卡片图片(留空不显示)">
          <Input
            data-testid="settings-field-site-qqGroupQr"
            value={qqGroupQr}
            onChange={(e) => setQqGroupQr(e.target.value)}
            placeholder="/uploads/qq-qr.png"
          />
        </Row>
        <Row label="加群链接" hint="一键入群(留空=群号点击改为复制)">
          <Input
            data-testid="settings-field-site-qqGroupJoinUrl"
            value={qqGroupJoinUrl}
            onChange={(e) => setQqGroupJoinUrl(e.target.value)}
            placeholder="https://qm.qq.com/q/…"
          />
        </Row>
      </Section>

      <Section
        id="content"
        title="内容展示"
        description="正文目录跟随滚动的展示开关;关闭后文章/静态页不渲染目录,恢复单栏正文"
      >
        <Row label="显示正文目录" hint="文章与静态页左侧目录列(移动端为正文顶部目录块)">
          <span className="flex items-center gap-3">
            <Switch
              data-testid="settings-field-content-tocEnabled"
              checked={tocEnabled}
              onChange={setTocEnabled}
              ariaLabel="显示正文目录"
            />
            <span className="text-[12.5px] text-body">{tocEnabled ? "开启" : "关闭"}</span>
          </span>
        </Row>
      </Section>

      <Section
        id="appearance"
        title="站点外观"
        description="favicon / 页头 logo / 页头与页面背景图;填站内路径或 http(s) 图片地址,保存后即时生效(配色主题在独立菜单「站点主题」)"
      >
        <Row label="站点 logo" hint="/logo.png(留空用内置)">
          <Input
            data-testid="settings-field-appearance-logoUrl"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </Row>
        <Row label="favicon 图标" hint="/favicon-32.png(留空用内置)">
          <Input
            data-testid="settings-field-appearance-faviconUrl"
            value={faviconUrl}
            onChange={(e) => setFaviconUrl(e.target.value)}
          />
        </Row>
        <Row label="页头背景图" hint="留空不显示">
          <Input
            data-testid="settings-field-appearance-headerBackgroundUrl"
            value={headerBackgroundUrl}
            onChange={(e) => setHeaderBackgroundUrl(e.target.value)}
          />
        </Row>
        <Row label="页面背景图" hint="全站装饰背景">
          <Input
            data-testid="settings-field-appearance-pageBackgroundUrl"
            value={pageBackgroundUrl}
            onChange={(e) => setPageBackgroundUrl(e.target.value)}
          />
        </Row>
      </Section>

      <Section
        id="tools"
        title="外部工具站"
        description="排行榜 / DKP 子站地址(换环境改后台,不重构建镜像)"
      >
        <Row label="排行榜地址" hint="工具页英雄榜等内链指向">
          <Input
            data-testid="settings-field-tools-rankBase"
            value={rankBase}
            onChange={(e) => setRankBase(e.target.value)}
          />
        </Row>
        <Row label="DKP 地址" hint="DKP 查询独立站">
          <Input
            data-testid="settings-field-tools-dkpUrl"
            value={dkpUrl}
            onChange={(e) => setDkpUrl(e.target.value)}
          />
        </Row>
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-line bg-panel-strong px-4 py-3">
        <Button
          data-testid="settings-save-general"
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存常规设置"}
        </Button>
        {error ? (
          <span data-testid="settings-result-general" role="alert" className="text-[12.5px] text-danger">
            {error}
          </span>
        ) : saved ? (
          <span data-testid="settings-result-general" className="text-[12.5px] text-ok-bright">
            已保存,即时生效
          </span>
        ) : dirty ? (
          <span data-testid="settings-result-general" className="text-[12.5px] text-highlight">
            ● 有未保存的修改
          </span>
        ) : null}
        <span className="ml-auto text-[11.5px] text-muted">
          一次保存提交五个分区;保存后即时生效(无需重启)
        </span>
      </div>
    </div>
  );
}
