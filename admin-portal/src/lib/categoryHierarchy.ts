export type CategoryHierarchyNode = {
  _id: string;
  name: string;
  parent: string | null;
};

export type CategoryTreeNode = {
  id: string;
  name: string;
  parent: string | null;
  depth: number;
  children: CategoryTreeNode[];
};

export function buildCategoryMap(categories: CategoryHierarchyNode[]) {
  const map = new Map<string, CategoryHierarchyNode>();
  for (const category of categories) {
    map.set(category._id, category);
  }
  return map;
}

export function getHierarchyLabel(
  categoryId: string,
  map: Map<string, CategoryHierarchyNode>
) {
  const names: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const node = map.get(currentId);
    if (!node) break;
    names.push(node.name);
    currentId = node.parent || null;
  }

  return names.reverse().join(" > ");
}

export function getDescendantIds(rootId: string, categories: CategoryHierarchyNode[]) {
  const children = new Map<string, string[]>();

  for (const category of categories) {
    if (!category.parent) continue;
    const arr = children.get(category.parent) || [];
    arr.push(category._id);
    children.set(category.parent, arr);
  }

  const descendants = new Set<string>();
  const stack = [...(children.get(rootId) || [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || descendants.has(current)) continue;
    descendants.add(current);
    const next = children.get(current) || [];
    for (const id of next) stack.push(id);
  }

  return descendants;
}

export function buildChildrenMap(categories: CategoryHierarchyNode[]) {
  const children = new Map<string | null, CategoryHierarchyNode[]>();
  children.set(null, []);

  for (const category of categories) {
    const parentKey = category.parent || null;
    const list = children.get(parentKey) || [];
    list.push(category);
    children.set(parentKey, list);
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return children;
}

export function buildDepthMap(categories: CategoryHierarchyNode[]) {
  const byId = buildCategoryMap(categories);
  const depthMap = new Map<string, number>();

  const computeDepth = (id: string, seen: Set<string>): number => {
    if (depthMap.has(id)) return depthMap.get(id) || 0;
    if (seen.has(id)) return 0;
    seen.add(id);

    const node = byId.get(id);
    if (!node || !node.parent) {
      depthMap.set(id, 0);
      return 0;
    }

    const parentDepth: number = computeDepth(node.parent, seen);
    const depth: number = parentDepth + 1;
    depthMap.set(id, depth);
    return depth;
  };

  for (const category of categories) {
    computeDepth(category._id, new Set());
  }

  return depthMap;
}

export function buildHierarchyTree(categories: CategoryHierarchyNode[]) {
  const children = buildChildrenMap(categories);
  const depthMap = buildDepthMap(categories);

  const buildNode = (category: CategoryHierarchyNode): CategoryTreeNode => ({
    id: category._id,
    name: category.name,
    parent: category.parent,
    depth: depthMap.get(category._id) || 0,
    children: (children.get(category._id) || []).map(buildNode),
  });

  return (children.get(null) || []).map(buildNode);
}
