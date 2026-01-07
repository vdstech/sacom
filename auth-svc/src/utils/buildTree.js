export default function buildTree(categories) {
  const map = new Map();
  const roots = [];

  for (const c of categories) {
    map.set(String(c._id), { ...c, children: [] });
  }

  for (const c of categories) {
    const node = map.get(String(c._id));
    if (c.parentId) {
      const parent = map.get(String(c.parentId));
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes) => {
    nodes.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}