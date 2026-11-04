import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPanel } from "@/components/site/content-panel";
import { ThreadComposerForm } from "@/components/forum/thread-composer-form";
import { getServerSession } from "@/server/session-guard";
import { getForumBoardBySlug } from "@/server/services/forum/browse";

export const metadata = { title: "发新主题 · 老克塔" };

/** 发新主题页(#34 2026-11-04):仅登录用户;游客跳登录带 next 回跳 */
export default async function NewThreadPage({
  params,
}: {
  params: { board: string };
}) {
  const session = await getServerSession();
  if (!session) {
    return (
      <main className="container-site flex-1 py-5 lg:py-6">
        <ContentPanel className="mx-auto flex max-w-xl flex-col gap-3 p-6 text-sm">
          <h1 className="text-lg font-bold text-[#dcebf7]">发新主题</h1>
          <p className="text-[#93b2ce]">
            发帖需登录。请先
            <Link
              href={`/login?next=${encodeURIComponent(`/forum/${params.board}/new`)}`}
              className="mx-1 text-[#6fb7e0] hover:underline"
            >
              登录
            </Link>
            或
            <Link href="/register" className="mx-1 text-[#6fb7e0] hover:underline">
              注册
            </Link>
            账号。
          </p>
        </ContentPanel>
      </main>
    );
  }

  const board = await getForumBoardBySlug(decodeURIComponent(params.board));
  if (!board) notFound();

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <ContentPanel className="mx-auto flex max-w-3xl flex-col gap-4 p-5 lg:p-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#dcebf7]">发新主题</h1>
          <p className="mt-1 text-[13px] text-[#6482a3]">
            版块:{board.name}
            <Link href={`/forum/${board.slug}`} className="ml-2 text-[#6fb7e0] hover:underline">
              返回版块
            </Link>
          </p>
        </div>
        <ThreadComposerForm boardSlug={board.slug} />
      </ContentPanel>
    </main>
  );
}
