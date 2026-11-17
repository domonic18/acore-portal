/**
 * 提问脱敏抽词(M9 W8):从用户提问里抽「热门问题词」。
 *
 * 口径:只落聚合词,不落对话正文——中文无空格分词,先剔功能字再取片段,
 * 短句取整串(「法师升级」)、长句取二元片段;含数字/联系方式的 token 丢弃,
 * 英文按词。抽词是纯函数,便于单测锁死口径。
 */

/** 功能字:出现即视为虚词,剔除后剩下的才是实词片段(只收虚词,勿收实义字) */
const FUNCTION_CHARS = new Set(
  "的了是我你他她它们这那有在和与或也就都还又很太想要能会该于之其此为以得着过来去上下中里外前后请帮说看知问吗呢吧啊呀哦嗯些什么怎样如何且并且但却从比对给让把被用等各个只再最已未不没".split(
    "",
  ),
);

/** 整词停用表(剔功能字后仍成词的虚词组合) */
const STOPWORDS = new Set([
  "什么",
  "怎么",
  "怎样",
  "如何",
  "为什么",
  "可以",
  "能否",
  "是否",
  "请问",
  "介绍",
  "一下",
  "谢谢",
  "你好",
  "我想",
  "想知道",
  "help",
  "the",
  "and",
  "for",
]);

const MAX_TOKEN_LEN = 12;
const MAX_TOKENS_PER_QUESTION = 10;

/** 含数字的片段一律丢弃(可能是账号/ID/金额等个人信息) */
function hasDigit(text: string): boolean {
  return /\d/.test(text);
}

function isAsciiWord(text: string): boolean {
  return /^[a-z]+$/.test(text);
}

/** 中文片段:剔功能字后取词(短整串,长二元);单字无实义,丢弃 */
function cjkTokens(run: string): string[] {
  if (STOPWORDS.has(run)) return [];
  const cleaned = [...run].filter((c) => !FUNCTION_CHARS.has(c)).join("");
  if (cleaned.length < 2) return [];
  if (cleaned.length <= 6) return [cleaned];
  const out: string[] = [];
  for (let i = 0; i + 2 <= cleaned.length; i++) out.push(cleaned.slice(i, i + 2));
  return out;
}

/**
 * 从提问里抽脱敏词(去重、保序)。非字符串/空串返回空数组。
 */
export function extractQuestionKeywords(question: string | null | undefined): string[] {
  if (!question) return [];
  const text = question.toLowerCase();
  const tokens: string[] = [];
  const push = (token: string) => {
    if (!token || token.length > MAX_TOKEN_LEN) return;
    if (hasDigit(token)) return;
    if (STOPWORDS.has(token)) return;
    if (!tokens.includes(token)) tokens.push(token);
  };

  const segments = text.match(/[a-z]+|[一-鿿]+/g) ?? [];
  for (const segment of segments) {
    if (isAsciiWord(segment)) {
      if (segment.length >= 2) push(segment);
      continue;
    }
    for (const token of cjkTokens(segment)) push(token);
  }

  return tokens.slice(0, MAX_TOKENS_PER_QUESTION);
}

/** 关键词计数合并(新词追加,旧词累加) */
export function mergeKeywordCounts(
  current: Record<string, number>,
  tokens: string[],
): Record<string, number> {
  const merged = { ...current };
  for (const token of tokens) {
    merged[token] = (merged[token] ?? 0) + 1;
  }
  return merged;
}

/** 计数 map 取 TopN(按次数降序,同次数按词序稳定) */
export function topKeywords(
  counts: Record<string, number>,
  limit: number,
): { keyword: string; count: number }[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}
