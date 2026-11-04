/** M1 展示框架:结构就绪空态(契约 GET /api/account/raf),数据 M2 接入 */
export default function RafPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">RAF 招募</h1>
      <section className="flex flex-col gap-2 rounded-md border border-[#22385a] px-6 py-4 text-sm">
        <h2 className="text-base font-semibold">招募进展</h2>
        <p className="text-[#93b2ce]">
          已招募:<strong className="text-[#dcebf7]">0</strong> 人
        </p>
        <p className="text-[#6482a3]">招募进度数据将在 RAF 活动开启后展示。</p>
      </section>
      <section className="flex flex-col gap-1 rounded-md border border-[#22385a] px-6 py-4 text-sm text-[#93b2ce]">
        <h2 className="text-base font-semibold text-[#dcebf7]">玩法说明</h2>
        <p>· 通过专属链接邀请新玩家注册并创建角色,即建立招募关系。</p>
        <p>· 被招募角色达到等级里程碑后,双方可获得奖励。</p>
        <p className="text-[#6482a3]">· 具体规则与奖励以活动开启公告为准。</p>
      </section>
    </main>
  );
}
