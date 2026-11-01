import type { ProgressionDraftItem } from "@/components/admin/progression-card-editor";

export type AdminProgressionNode = {
  id: string;
  title: string;
  phaseDate: string | null;
  imageUrl: string | null;
  bodyMd: string | null;
  status: string;
  icon: string | null;
  sort: number;
  isCurrent: boolean;
};

type PayloadItem = {
  id: string | null;
  title: string;
  phaseDate: string | null;
  imageUrl: string | null;
  bodyMd: string | null;
  status: "locked" | "open";
  icon: string | null;
};

export function toDraft(node: AdminProgressionNode): ProgressionDraftItem {
  return {
    uid: node.id,
    id: node.id,
    title: node.title,
    phaseDate: node.phaseDate ?? "",
    imageUrl: node.imageUrl ?? "",
    bodyMd: node.bodyMd ?? "",
    status: node.status === "open" ? "open" : "locked",
    icon: node.icon ?? "",
  };
}

export function toPayload(
  items: ProgressionDraftItem[],
  deletedIds: string[],
  currentId: string | null,
) {
  return {
    items: items.map<PayloadItem>((item) => ({
      id: item.id,
      title: item.title.trim(),
      phaseDate: item.phaseDate || null,
      imageUrl: item.imageUrl.trim() || null,
      bodyMd: item.bodyMd.trim() ? item.bodyMd : null,
      status: item.status,
      icon: item.icon.trim() || null,
    })),
    deletedIds,
    currentId,
  };
}
