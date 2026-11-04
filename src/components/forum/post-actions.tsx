"use client";

import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";

/** 版主删楼层(#34):软删单层,主贴(floor=1)不渲染此按钮 */
export function PostActions({ threadId, postId }: { threadId: string; postId: string }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm("确认删除该楼层?删除后不可恢复。")) return;
    try {
      await requestJson(`/api/forum/moderate/post/${postId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      router.refresh();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      className="rounded text-[11.5px] text-[#6482a3] underline-offset-2 hover:text-[#eda9a9] hover:underline"
    >
      删除楼层
    </button>
  );
}
