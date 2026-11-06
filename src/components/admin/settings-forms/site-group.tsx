"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, TextAreaRow, TextRow, useGroupSave } from "./common";

export function SiteGroup({ view }: { view: SettingsView["site"] }) {
  const [icp, setIcp] = useState(view.icp);
  const [copyrightEn, setCopyrightEn] = useState(view.copyrightEn);
  const [qqGroup, setQqGroup] = useState(view.qqGroup);
  const [qqGroupQr, setQqGroupQr] = useState(view.qqGroupQr);
  const [qqGroupJoinUrl, setQqGroupJoinUrl] = useState(view.qqGroupJoinUrl);
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="site"
      title="站点信息"
      description="页脚备案/版权与侧栏 QQ 交流群;备案号/版权声明/群号留空=前台对应元素不显示"
    >
      <TextRow label="ICP 备案号" testid="settings-field-site-icp" value={icp} onChange={setIcp} placeholder="京ICP备…(留空隐藏)" />
      <TextAreaRow
        label="英文版权声明"
        testid="settings-field-site-copyrightEn"
        value={copyrightEn}
        onChange={setCopyrightEn}
        rows={4}
        placeholder="页脚商标免责声明(留空隐藏)"
      />
      <TextRow
        label="QQ 交流群号"
        testid="settings-field-site-qqGroup"
        value={qqGroup}
        onChange={setQqGroup}
        placeholder="184670219(留空隐藏侧栏卡片)"
      />
      <TextRow
        label="加群二维码图片"
        testid="settings-field-site-qqGroupQr"
        value={qqGroupQr}
        onChange={setQqGroupQr}
        placeholder="/uploads/qq-qr.png(留空不显示二维码)"
      />
      <TextRow
        label="加群链接"
        testid="settings-field-site-qqGroupJoinUrl"
        value={qqGroupJoinUrl}
        onChange={setQqGroupJoinUrl}
        placeholder="https://qm.qq.com/q/…(留空=群号点击改为复制)"
      />
      <SaveBar
        group="site"
        busy={busy}
        saved={saved}
        error={error}
        onSave={() => save("site", { icp, copyrightEn, qqGroup, qqGroupQr, qqGroupJoinUrl })}
      />
    </GroupSection>
  );
}
