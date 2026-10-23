import { prisma } from "@/lib/db";
import { requireSession } from "@/server/session-guard";
import { SettingsForms } from "./settings-forms";

/** 服务端壳:RSC 深校验(布局层)+ user 数据注入;交互面见 settings-forms.tsx */
export default async function AccountSettingsPage() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: BigInt(session.userId) },
    select: { username: true, email: true, nickname: true },
  });

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
