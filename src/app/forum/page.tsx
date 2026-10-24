import Link from "next/link";
import { listForumBoards } from "@/server/services/forum/browse";

export const metadata = { title: "论坛 · 老克塔" };

/** 版块列表(FR-219;Q1 完全只读——本页零发帖入口) */
export default async function ForumPage() {
  const boards = await listForumBoards();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="border-b border-[#1e2a3d] pb-3">
        <h1 className="text-2xl font-bold text-[#e6d8a8]">论坛</h1>
        <p className="mt-1 text-sm text-[#5d6b80]">
          存量社区归档(只读浏览;问题反馈请前往客服群)。
        </p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {boards.map((b) => (
          <li
            key={b.slug}
            className="rounded border border-[#1e2a3d] bg-[#101827]/60 p-4 hover:border-[#3a4a63]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/forum/${b.slug}`}
                className="text-lg font-medium text-[#c7d2e0] hover:text-[#e6d8a8]"
              >
                {b.name}
              </Link>
              <span className="text-xs text-[#5d6b80]">{b.threadCount} 主题</span>
            </div>
            {b.description && (
              <p className="mt-1 text-sm text-[#8fa0b8]">{b.description}</p>
            )}
            {b.latestThread && (
              <p className="mt-2 truncate text-xs text-[#5d6b80]">
                最新:{" "}
                <Link
                  href={`/forum/thread/${b.latestThread.id}`}
                  className="hover:text-[#e6d8a8]"
                >
                  {b.latestThread.title}
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
