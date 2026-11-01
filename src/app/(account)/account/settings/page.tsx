import { requireSession } from "@/server/session-guard";
import { getAccountProfile } from "@/server/services/account/profile";
import { SettingsForms } from "./settings-forms";

/** 服务端壳:RSC 深校验(布局层)+ user 数据注入;交互面见 settings-forms.tsx */
export default async function AccountSettingsPage() {
  const session = await requireSession();
  const user = await getAccountProfile(BigInt(session.userId));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">账户设置</h1>
      <SettingsForms
        username={user.username}
        email={user.email}
        nickname={user.nickname ?? user.username}
      />
    </main>
  );
}
