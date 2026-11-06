export type Banner = {
  id: string;
  title: string;
  imageUrl: string;
  /** 轮播视频地址:非空=静音循环播放,imageUrl 作封面 */
  videoUrl: string | null;
  linkUrl: string;
  sort: number;
  enabled: boolean;
};

export type Draft = {
  title: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  sort: string;
  enabled: boolean;
};

export const EMPTY: Draft = {
  title: "",
  imageUrl: "",
  videoUrl: "",
  linkUrl: "",
  sort: "0",
  enabled: true,
};
