import { config } from "../../package.json";
import type { BookmarkNode } from "./treeBuilder";
import { treeToString, countNodes } from "./treeBuilder";

export type PreviewAction = "confirm" | "cancel" | "export";

/**
 * Show an outline preview to the user and capture their decision.
 *
 * Flow:
 * 1. Display tree in a progress window
 * 2. Ask "Write outline?" → Confirm
 * 3. If no → "Export JSON?" → Export
 * 4. Otherwise → Cancel
 */
export async function showPreview(
  tree: BookmarkNode[],
): Promise<PreviewAction> {
  const previewText = buildPreviewText(tree);
  const totalNodes = countNodes(tree);
  const maxLines = treeToString(tree).split("\n").length;

  // ── Show tree in progress window ─────────────────────────────────────
  const pw = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  });

  pw.createLine({
    text: `Outline Preview (${totalNodes} entries, ${maxLines} lines)`,
    type: "default",
    progress: 100,
  });

  const displayLines = previewText.split("\n");
  const maxShow = Math.min(displayLines.length, 30);
  for (let i = 0; i < maxShow; i++) {
    pw.createLine({
      text: displayLines[i],
      type: "default",
      progress: 100,
    });
  }

  if (displayLines.length > maxShow) {
    pw.createLine({
      text: `... (${displayLines.length - maxShow} more lines)` as any,
      type: "default",
      progress: 100,
    });
  }

  pw.show();

  // ── Ask user ─────────────────────────────────────────────────────────
  const Services = (globalThis as any).Services;
  const win = (globalThis as any).Zotero?.getMainWindow?.();

  if (!Services?.prompt || !win) {
    pw.close();
    return "cancel";
  }

  const proceed = Services.prompt.confirm(
    win,
    "Patent Outline Generator",
    `The outline has ${totalNodes} entries across ${maxLines} lines.\n\nWrite this outline into the PDF?`,
  );

  if (proceed) {
    pw.close();
    return "confirm";
  }

  const doExport = Services.prompt.confirm(
    win,
    "Patent Outline Generator",
    "Cancel the operation?\n\n(Yes = Cancel | No = Export JSON instead)",
  );

  pw.close();

  if (!doExport) return "export";
  return "cancel";
}

function buildPreviewText(tree: BookmarkNode[]): string {
  const lines: string[] = [];

  let idx = 0;
  function walk(nodes: BookmarkNode[], indent: number) {
    for (const node of nodes) {
      const prefix = "│  ".repeat(indent);
      const isLast = nodes.indexOf(node) === nodes.length - 1;
      const branch = isLast ? "└─ " : "├─ ";
      idx++;
      lines.push(`${prefix}${branch}[${idx}] ${node.title} (p.${node.page}, L${node.level})`);
      if (node.children.length > 0) {
        walk(node.children, indent + 1);
      }
    }
  }

  walk(tree, 0);
  return lines.join("\n");
}
