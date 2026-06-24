import type { OutlineNode } from "./outlineBuilder";

export interface BookmarkNode {
  title: string;
  page: number;
  level: number;
  children: BookmarkNode[];
}

/**
 * Convert a flat, level-indented outline list into a hierarchical tree.
 *
 * Rules:
 * - Level 1 = top-level node
 * - Each subsequent level must increment by at most 1
 * - Levels can skip (e.g. 1 → 3 is flattened to 1 → 2 → 3)
 * - Page numbers are kept 1-based as provided
 */
export function buildTree(items: OutlineNode[]): BookmarkNode[] {
  const root: BookmarkNode[] = [];
  const stack: { node: BookmarkNode; level: number }[] = [];

  for (const item of items) {
    if (item.level < 1) continue;

    const node: BookmarkNode = {
      title: item.title,
      page: item.page,
      level: item.level,
      children: [],
    };

    while (
      stack.length > 0 &&
      stack[stack.length - 1].level >= item.level
    ) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level: item.level });
  }

  return root;
}

/**
 * Validate a bookmar tree against a set of rules.
 * Returns null if valid, or an error message if invalid.
 */
export function validateTree(
  tree: BookmarkNode[],
  maxPage: number,
): string | null {
  const issues: string[] = [];

  function walk(nodes: BookmarkNode[], depth: number) {
    for (const node of nodes) {
      if (node.page < 1) {
        issues.push(`"${node.title}" has invalid page ${node.page}`);
      }
      if (node.page > maxPage) {
        issues.push(
          `"${node.title}" page ${node.page} exceeds document (${maxPage})`,
        );
      }
      if (node.children.length > 0) {
        const firstChildLevel = node.children[0].level;
        if (firstChildLevel <= node.level) {
          issues.push(
            `"${node.title}" child level ${firstChildLevel} not > parent level ${node.level}`,
          );
        }
      }
      walk(node.children, depth + 1);
    }
  }

  walk(tree, 0);
  return issues.length > 0 ? issues.join("; ") : null;
}

/**
 * Count total nodes in a tree (including all descendants).
 */
export function countNodes(tree: BookmarkNode[]): number {
  let count = 0;
  for (const node of tree) {
    count += 1 + countNodes(node.children);
  }
  return count;
}

/**
 * Serialize a tree to a human-readable indented string.
 */
export function treeToString(
  tree: BookmarkNode[],
  indent: number = 0,
): string {
  const lines: string[] = [];
  for (const node of tree) {
    const prefix = "│  ".repeat(indent);
    const isLast = tree.indexOf(node) === tree.length - 1;
    const branch = isLast ? "└─ " : "├─ ";
    const content = `${node.title}`;
    const pageInfo = `(p.${node.page})`;
    lines.push(`${prefix}${branch}${content} ${pageInfo}`);
    if (node.children.length > 0) {
      lines.push(...treeToString(node.children, indent + 1));
    }
  }
  return lines.join("\n");
}
