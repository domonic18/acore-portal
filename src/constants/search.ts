// 站内搜索(M8)公开契约:四内容组、最低查询长度、每组命中限额
// W1 降级态关键词列表与 W6 Agent 检索工具共用 searchSite 单一收口

/** ngram token_size=2:单字符查询无区分度,最小 2 字符 */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** 每组返回条数上限(页面与 Agent 引用共用) */
export const SEARCH_GROUP_LIMIT = 5;

/** 最多参与的词数(超出截断,防超长查询打爆 MATCH 解析) */
export const SEARCH_MAX_TERMS = 8;

/** 单词最大长度(ngram 场景防超长 phrase) */
export const SEARCH_MAX_TERM_LENGTH = 32;

/** 语义召回每组候选数(余弦 top-K,再与关键词路 RRF 融合) */
export const SEARCH_SEMANTIC_TOPK = 20;

/** RRF 融合常数(spec §19 口径) */
export const SEARCH_RRF_K = 60;

export const SEARCH_GROUPS = ["articles", "pages", "products", "forum"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export const SEARCH_GROUP_LABELS: Record<SearchGroup, string> = {
  articles: "攻略文章",
  pages: "使用说明",
  products: "商品",
  forum: "论坛",
} as const;

/** 向量库(search_embedding.entity_type)取值域;FAQ 独立成实体(回链其所属商品页) */
export const SEARCH_ENTITY_TYPES = [
  "article",
  "content_page",
  "product",
  "product_faq",
  "forum_thread",
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
