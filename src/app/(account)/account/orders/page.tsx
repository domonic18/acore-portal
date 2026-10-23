/** M1 空态框架页(FR-018):订单实体 M2 随商城落地 */
export default function OrdersPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">订单</h1>
      <div className="flex flex-col items-center gap-2 rounded border border-dashed border-gray-700 px-6 py-12 text-center">
        <p className="text-gray-300">暂无订单</p>
        <p className="text-sm text-gray-500">
          商城上线后,购买记录与发货状态将在这里展示。
        </p>
      </div>
    </main>
  );
}
