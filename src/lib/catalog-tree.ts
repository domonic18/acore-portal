/**
 * 商品分类树(纯函数,无 IO):
 * 分类语义为「单分类 + 父子聚合」——商品只属一个叶子分类,父分类的计数是子树合计。
 * 前台分面栏要点父分类看子树商品,故须能取到「子树 id 集合」再下推到 DB 层过滤
 * (product.category_id 有索引,比 JOIN 分类表再比 slug 快)。
 */

/** 分类平铺行(id/parentId 用字符串承载 BigInt,避免前端精度问题) */
export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sort: number;
  /** 该分类**自身**的商品数(published + listed) */
  ownCount: number;
};

export type CategoryNode = CategoryRow & {
  /** 自身 + 全部子孙的商品数 */
  subtreeCount: number;
  children: CategoryNode[];
};

/**
 * 构建分类树。
 * - parentId 指向不存在的行 ⇒ 该行按根处理(不静默丢商品);
 * - 存在环(含自指)⇒ 抛错(环会让子树计数与筛选结果不可预期,宁可炸也不给错数)。
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, subtreeCount: 0, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  assertNoCycle(byId);
  for (const root of roots) countSubtree(root);
  sortTree(roots);
  return roots;
}

/** 沿 parentId 上溯;重复访问即成环 */
function assertNoCycle(byId: Map<string, CategoryNode>): void {
  for (const node of byId.values()) {
    const seen = new Set<string>([node.id]);
    let cursor = node.parentId ? byId.get(node.parentId) : undefined;
    while (cursor) {
      if (seen.has(cursor.id)) throw new Error(`商品分类树存在环:${node.id}`);
      seen.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
}

/** 后序累加子树计数 */
function countSubtree(node: CategoryNode): number {
  let sum = node.ownCount;
  for (const child of node.children) sum += countSubtree(child);
  node.subtreeCount = sum;
  return sum;
}

/** 同层排序:sort 升序,同 sort 按名称(保证稳定) */
function sortTree(nodes: CategoryNode[]): void {
  nodes.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-Hans-CN"));
  for (const node of nodes) sortTree(node.children);
}

/** 树 → 前序平铺列表(便于查节点、算祖先) */
export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** 按 slug 查节点(未知 slug 返回 null) */
export function findNodeBySlug(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of flattenCategoryTree(nodes)) {
    if (node.slug === slug) return node;
  }
  return null;
}

/** 节点自身 + 全部子孙的 id 集合(分类筛选下推 DB 层用) */
export function subtreeIdsOf(nodes: CategoryNode[], rootId: string): string[] {
  const target = flattenCategoryTree(nodes).find((n) => n.id === rootId);
  if (!target) return [];
  const ids: string[] = [];
  const walk = (node: CategoryNode) => {
    ids.push(node.id);
    for (const child of node.children) walk(child);
  };
  walk(target);
  return ids;
}

/** 祖先 id 链(根 → 父),用于把命中分类的父级自动展开 */
export function ancestorIdsOf(flat: CategoryNode[], id: string): string[] {
  const byId = new Map(flat.map((n) => [n.id, n]));
  const chain: string[] = [];
  let cursor = byId.get(id)?.parentId ?? null;
  while (cursor && byId.has(cursor)) {
    chain.unshift(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return chain;
}

/**
 * 剪掉「自身与子树都没有商品」的节点(分面栏不显示点进去是空的分类)。
 * 父节点若子树有货则保留,即便自身 0 件(如「武器」0 件但子分类有 10+4)。
 */
export function pruneEmptyCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes
    .map((node) => ({ ...node, children: pruneEmptyCategories(node.children) }))
    .filter((node) => node.subtreeCount > 0);
}
