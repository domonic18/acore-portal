import { className as classLabel, raceName } from "@/constants/characters";
import { raceFacePath } from "@/constants/portraits";

/**
 * 我的角色页种族/职业官方图标(2026-11-05):
 * 素材移植自 acore-ranking(public/assets/icons),源自 WoW 客户端
 * CharacterCreate 种族头像(64×64,按性别)与经典职业图标(hd{classId}.png);
 * 种族头像映射收口 constants/portraits(与页头随机头图同源)。
 * 未登记 id 回退文字,信息不丢;页面私有组件与本页同目录。
 */

/** 职业官方图标;未登记职业(60 年代无 DK)回退文字 */
export function ClassIcon({ classId, size = 20 }: { classId: number; size?: number }) {
  if (![1, 2, 3, 4, 5, 7, 8, 9, 11].includes(classId)) {
    return <span className="text-xs text-[#93b2ce]">{classLabel(classId)}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 静态官方图标集,非 next/image 优化对象
    <img
      src={`/assets/icons/class/hd${classId}.png`}
      alt={classLabel(classId)}
      title={classLabel(classId)}
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
    />
  );
}

/** 种族官方图标(按性别);未登记种族回退文字 */
export function RaceIcon({
  race,
  gender,
  size = 20,
}: {
  race: number;
  gender: number;
  size?: number;
}) {
  const src = raceFacePath(race, gender);
  if (!src) {
    return <span className="text-xs text-[#93b2ce]">{raceName(race)}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 静态官方图标集,非 next/image 优化对象
    <img
      src={src}
      alt={raceName(race)}
      title={raceName(race)}
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
    />
  );
}
