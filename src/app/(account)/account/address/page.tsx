/** M1 空态框架页(FR-018):地址簿实体 M2 随商城落地 */
export default function AddressPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">收货地址</h1>
      <div className="flex flex-col items-center gap-2 rounded border border-dashed border-gray-700 px-6 py-12 text-center">
        <p className="text-gray-300">暂无收货地址</p>
        <p className="text-sm text-gray-500">
          实体奖品寄送功能上线后,可在这里维护地址簿。
        </p>
      </div>
    </main>
  );
}
