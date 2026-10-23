import { requireSession } from "@/server/session-guard";
import { characterAvatar, className, raceName } from "@/constants/characters";
import { GameDbError } from "@/server/services/characters";
import { listAccountCharacters } from "@/server/services/account/characters";

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
        <p className="text-sm text-gray-400">
          名下暂无游戏角色。创建角色后此处会自动展示。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {characters.map((c) => {
            const avatar = characterAvatar(c.name, c.class);
            return (
              <li
                key={c.guid}
                className="flex items-center gap-4 rounded border border-gray-800 px-4 py-3"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-gray-900"
                  style={{ backgroundColor: avatar.color }}
                >
                  {avatar.initial}
                </span>
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-gray-400">
                  {raceName(c.race)} · {className(c.class)}
                </span>
                <span className="text-sm text-gray-400">{c.gender === 0 ? "男" : "女"}</span>
                <span className="text-sm">Lv{c.level}</span>
                <span
                  className={`ml-auto text-sm ${c.online ? "text-green-400" : "text-gray-500"}`}
                >
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
