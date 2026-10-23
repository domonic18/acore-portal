export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">老克塔 · AzerothCore 怀旧社区</h1>
      <p className="text-gray-400">怀旧公益项目 · 官网重开发版(M1 地基)</p>
      <div className="flex gap-4">
        <a
          href="/login"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        >
          登录
        </a>
        <a
          href="/register"
          className="rounded border border-gray-600 px-4 py-2 hover:border-gray-400"
        >
          注册
        </a>
      </div>
    </main>
  );
}
