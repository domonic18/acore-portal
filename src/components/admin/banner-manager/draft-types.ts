export type Banner = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  sort: number;
  enabled: boolean;
};

export type Draft = { title: string; imageUrl: string; linkUrl: string; sort: string; enabled: boolean };

export const EMPTY: Draft = { title: "", imageUrl: "", linkUrl: "", sort: "0", enabled: true };
