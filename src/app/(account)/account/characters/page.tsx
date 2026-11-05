import { requireSession } from "@/server/session-guard";
import { CLASS_COLORS } from "@/constants/characters";
import { PORTRAIT_DEFAULT, raceFacePath } from "@/constants/portraits";
import { GameDbError } from "@/server/services/shared/game-identity";
import { listAccountCharacters } from "@/server/services/account/characters";
import { ClassIcon, RaceIcon } from "./char-icons";

/** 契约:角色只读投影(account=本人服务端过滤);503 错误面板不白屏 */
export default async function CharactersPage() {
  const session = await requireSession();

  let error: string | null = null;
  let characters: Awaited<ReturnType<typeof listAccountCharacters>> = [];
  try {
    characters = await listAccountCharacters(BigInt(session.userId));
  } catch (err) {
    if (err instanceof GameDbError) {
      error = "游戏数据暂时不可用,请稍后重试。";
    } else {
      throw err;
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">我的角色</h1>
      {error ? (
        <p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          {error}
        </p>
      ) : characters.length === 0 ? (
        <p className="text-sm text-[#93b2ce]">
          名下暂无游戏角色。创建角色后此处会自动展示。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {characters.map((c) => {
            const portrait = raceFacePath(c.race, c.gender) ?? PORTRAIT_DEFAULT;
            return (
              <li
                key={c.guid}
                className="flex items-center gap-3 rounded-lg border border-[#22385a] bg-[#0d1a2e]/40 px-3 py-2.5 whitespace-nowrap"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 静态 SVG 占位集,非 next/image 优化对象 */}
                <img
                  src={portrait}
                  alt={`${c.name} 头像`}
                  className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-[#c9a227]/40"
                />
                <span
                  className="min-w-0 flex-1 truncate font-semibold"
                  style={{ color: CLASS_COLORS[c.class] ?? "#e8eef7" }}
                  title={c.name}
                >
                  {c.name}
                </span>
                <span className="shrink-0 rounded bg-[#22385a] px-1.5 py-0.5 font-mono text-xs text-[#93b2ce]">
                  Lv{c.level}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 text-[#93b2ce]">
                  <RaceIcon race={c.race} gender={c.gender} />
                  <ClassIcon classId={c.class} />
                  <span className="text-xs text-[#6482a3]" title={c.gender === 0 ? "男性" : "女性"}>
                    {c.gender === 0 ? "♂" : "♀"}
                  </span>
                </span>
                <span
                  className={`flex shrink-0 items-center gap-1.5 text-xs ${
                    c.online ? "text-green-400" : "text-[#6482a3]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${c.online ? "bg-green-400" : "bg-[#6482a3]"}`}
                  />
                  {c.online ? "在线" : "离线"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
