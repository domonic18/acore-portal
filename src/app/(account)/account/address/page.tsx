/** M1 空态框架页(FR-018):地址簿实体 M2 随商城落地 */
export default function AddressPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">收货地址</h1>
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[#22385a] px-6 py-12 text-center">
        <p className="text-[#c7d5e6]">暂无收货地址</p>
        <p className="text-sm text-[#6482a3]">
          实体奖品寄送功能上线后,可在这里维护地址簿。
        </p>
      </div>
    </main>
  );
}
