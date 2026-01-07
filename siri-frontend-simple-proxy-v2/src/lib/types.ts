export type StoreNavNode = {
  _id: string;
  name: string;
  children?: StoreNavNode[];
};

export type UiNode = {
  id: string;
  label: string;
  children?: UiNode[];
};

export function mapTree(tree: StoreNavNode[] = []): UiNode[] {
  return tree.map((n) => ({
    id: n._id,
    label: n.name,
    children: n.children?.length ? mapTree(n.children) : undefined,
  }));
}
