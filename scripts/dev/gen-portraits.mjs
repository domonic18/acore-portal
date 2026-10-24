// 占位头像集生成(M3 US1 T017;R10):80 组合(8 种族×合法职业×2 性别)+default
// 产出 public/portraits/*.svg —— 简约身份框(种族底色+职业缩写+性别徽标),
// 后续替换真客户端素材只需覆盖同名文件。node scripts/dev/gen-portraits.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACE_CLASSES = {
  1: [1, 2, 4, 5, 8, 9],
  2: [1, 3, 4, 7, 9],
  3: [1, 2, 3, 4, 5],
  4: [1, 3, 4, 5, 11],
  5: [1, 4, 5, 8, 9],
  6: [1, 3, 7, 11],
  7: [1, 4, 8, 9],
  8: [1, 3, 4, 5, 7, 8],
};
const CLASS_ABBR = {
  1: "战",
  2: "骑",
  3: "猎",
  4: "盗",
  5: "牧",
  7: "萨",
  8: "法",
  9: "术",
  11: "德",
};
// 阵营系底色:联盟蓝系(1/3/4/7) 部落红系(2/5/6/8)
const RACE_TINT = {
  1: "#2c4a6e",
  3: "#33506f",
  4: "#274066",
  7: "#2f4f74",
  2: "#6e2c2c",
  5: "#4a2b45",
  6: "#6b3b23",
  8: "#5f3226",
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/portraits");
mkdirSync(outDir, { recursive: true });

function svg(race, klass, gender) {
  const tint = RACE_TINT[race];
  const mark = gender === 1 ? "♀" : "♂";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<rect width="96" height="96" rx="10" fill="${tint}"/>
<rect x="6" y="6" width="84" height="84" rx="7" fill="none" stroke="#c9a227" stroke-width="2"/>
<text x="48" y="58" font-family="serif" font-size="40" fill="#e6d8a8" text-anchor="middle">${CLASS_ABBR[klass]}</text>
<text x="82" y="22" font-family="sans-serif" font-size="16" fill="#9fb6cc" text-anchor="middle">${mark}</text>
</svg>`;
}

let n = 0;
for (const [race, classes] of Object.entries(RACE_CLASSES)) {
  for (const klass of classes) {
    for (const gender of [0, 1]) {
      writeFileSync(join(outDir, `${race}-${klass}-${gender}.svg`), svg(Number(race), klass, gender));
      n += 1;
    }
  }
}
writeFileSync(
  join(outDir, "default.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<rect width="96" height="96" rx="10" fill="#233043"/>
<rect x="6" y="6" width="84" height="84" rx="7" fill="none" stroke="#8a94a6" stroke-width="2"/>
<text x="48" y="60" font-family="serif" font-size="36" fill="#aab6c8" text-anchor="middle">克</text>
</svg>`,
);
console.log(`generated ${n} portraits + default → ${outDir}`);
