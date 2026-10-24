export type ResolveImage = (oldUrl: string) => string | undefined;

export interface ProgressionNodeSource {
  heading: string;
  /** ISO 日期串(yyyy-MM-dd);未定档为 null */
  date: string | null;
  descHtml: string;
  imageUrl: string | null;
  open: boolean;
  blockId: string | null;
}

export function createConverter(
  resolveImage?: ResolveImage,
): (html: string) => string;
export function decodeSlug(
  postName: string | null | undefined,
  postId: number,
): string;
export function normalizeWowheadShortcodes(markdown: string): string;
export function extractExcerpt(html: string, max?: number): string;
export function parseCnDate(text: unknown): string | null;
export function parseProgressionBlocks(pageHtml: string): ProgressionNodeSource[];
