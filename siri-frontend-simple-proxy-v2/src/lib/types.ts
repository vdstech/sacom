export type UiNode = {
  id: string;
  label: string;
  href: string;
  categorySlug?: string;
  isLiveCategory?: boolean;
  children?: UiNode[];
};
