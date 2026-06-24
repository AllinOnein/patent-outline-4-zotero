import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { discoverAttachments } from "./attachmentFinder";
import { readContentList } from "./zipReader";
import { extractContent } from "./contentExtractor";
import { readAIConfig } from "./aiClient";
import { buildOutline } from "./outlineBuilder";
import { writePdfOutline } from "./pdfWriter";
import { buildTree, validateTree, countNodes } from "./treeBuilder";
import type { BookmarkNode } from "./treeBuilder";
import { showPreview } from "./previewWindow";
import type { PreviewAction } from "./previewWindow";
import {
  createBackup,
  restoreBackup,
  removeBackup,
  verifyWrittenPdf,
} from "./backupManager";
import {
  saveBookmarkTree,
  saveWriteLog,
  saveModifiedPdf,
} from "../utils/debug";

const PREFS_PREFIX = config.prefsPrefix;

function getPref(key: string): any {
  try {
    return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
  } catch {
    return undefined;
  }
}

export function registerPatentMenu(): void {
  const menuIcon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${config.addonRef}-generate`,
    label: getString("menuitem-generate-outline"),
    commandListener: async () => {
      await handleGenerateOutline();
    },
    icon: menuIcon,
  });
}

async function handleGenerateOutline(): Promise<void> {
  // ── Step 0: Validate selection ──────────────────────────────────
  const zoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const items: Zotero.Item[] = zoteroPane.getSelectedItems();

  if (items.length === 0) {
    showError(getString("error-no-item-selected"), 5000);
    return;
  }

  const item = items[0];

  if (item.isAttachment()) {
    showError(getString("error-is-attachment"), 5000);
    return;
  }

  // Validate AI config early
  const aiConfig = readAIConfig();
  if (!aiConfig) {
    showError(getString("error-ai-config"), 10000);
    return;
  }

  // ── Step 1: Discover attachments ────────────────────────────────
  const progress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({ text: getString("progress-discovering"), type: "default", progress: 10 })
    .show();

  let discovery: Awaited<ReturnType<typeof discoverAttachments>>;
  try {
    discovery = await discoverAttachments(item);
  } catch (err) {
    progress.close();
    ztoolkit.log(err);
    showError(getString("error-discovery-failed"), 5000);
    return;
  }

  if (!discovery.pdfItem || !discovery.pdfPath) {
    progress.close();
    showError(getString("error-no-pdf"), 5000);
    return;
  }

  if (!discovery.zipItem || !discovery.zipPath) {
    progress.close();
    showError(getString("error-no-zip"), 5000);
    return;
  }

  // ── Step 2: Read ZIP content ────────────────────────────────────
  progress.changeLine({ text: "[1/5] Reading ZIP content...", progress: 20 });

  let flatContent: Awaited<ReturnType<typeof extractContent>>;
  try {
    const zipResult = await readContentList(discovery.zipPath);
    flatContent = extractContent(zipResult.entries);
  } catch (err) {
    progress.close();
    showError(getString("error-zip-read"), 10000);
    return;
  }

  progress.changeLine({
    text: `[2/5] Extracted ${flatContent.length} content items`,
    progress: 40,
  });

  // ── Step 3: AI generates outline ────────────────────────────────
  progress.changeLine({
    text: `[3/5] Calling AI (${aiConfig.model})...`,
    progress: 60,
  });

  let outlineResult: Awaited<ReturnType<typeof buildOutline>>;
  try {
    outlineResult = await buildOutline(flatContent, aiConfig, item.id);
  } catch (err) {
    ztoolkit.log(err);
    progress.close();
    const msg = (err as Error).message;
    if (msg.includes("timeout") || msg.includes("timed out")) {
      showError(getString("error-ai-timeout"), 15000);
    } else if (msg.includes("API key") || msg.includes("401") || msg.includes("403")) {
      showError(getString("error-ai-invalidkey"), 15000);
    } else {
      showError(getString("error-ai-failed"), 15000);
    }
    return;
  }

  progress.changeLine({
    text: `[4/5] AI generated ${outlineResult.outline.length} entries`,
    progress: 75,
  });

  // ── Step 4: Build tree ──────────────────────────────────────────
  const tree: BookmarkNode[] = buildTree(outlineResult.outline);
  const totalNodes = countNodes(tree);

  const shouldSaveDebug = getPref("outline.debug");
  if (shouldSaveDebug) {
    saveBookmarkTree(item.id, tree);
  }

  const validationError = validateTree(tree, 9999);
  if (validationError) {
    ztoolkit.log("[tree] validation:", validationError);
  }

  progress.changeLine({
    text: `[5/5] Tree built: ${totalNodes} nodes (L1-4)`,
    progress: 85,
  });

  progress.close();

  // ── Step 5: Show preview (if enabled) ───────────────────────────
  const shouldPreview = getPref("outline.preview");
  if (shouldPreview !== false) {
    const action: PreviewAction = await showPreview(tree);

    if (action === "cancel") {
      new ztoolkit.ProgressWindow(config.addonName, {
        closeOnClick: true,
        closeTime: 3000,
      })
        .createLine({ text: getString("result-cancelled"), type: "default", progress: 100 })
        .show();
      return;
    }

    if (action === "export") {
      const path = shouldSaveDebug ? await saveBookmarkTree(item.id, tree) : null;
      if (path) {
        new ztoolkit.ProgressWindow(config.addonName, {
          closeOnClick: true,
          closeTime: 5000,
        })
          .createLine({ text: `${getString("result-exported")}: ${path}`, type: "default", progress: 100 })
          .show();
      }
      return;
    }
  }

  // ── Step 6: Write outline to PDF ────────────────────────────────
  const writeProgress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({ text: "Writing outline to PDF...", type: "default", progress: 30 })
    .show();

  try {
    const shouldBackup = getPref("outline.backup");

    // 6a. Backup (if enabled)
    if (shouldBackup !== false) {
      writeProgress.changeLine({ text: "Backing up original PDF...", progress: 40 });
      await createBackup(discovery.pdfPath);
    }

    // 6b. Read PDF bytes
    const pdfBytes = await readFileBytes(discovery.pdfPath);

    // 6c. Write outline
    writeProgress.changeLine({ text: "Writing PDF outline...", progress: 60 });
    const { bytes, result } = await writePdfOutline(pdfBytes, tree);

    if (!result.success) {
      if (shouldBackup !== false) {
        await restoreBackup(discovery.pdfPath);
      }
      if (shouldSaveDebug) {
        await saveWriteLog(item.id, {
          timestamp: new Date().toISOString(),
          action: "write",
          itemId: item.id,
          success: false,
          details: result.error,
        });
      }
      writeProgress.close();
      showError(result.error || getString("error-pdf-write"), 15000);
      return;
    }

    // 6d. Write modified PDF back to original path
    writeProgress.changeLine({ text: "Saving modified PDF...", progress: 80 });
    await writeFileBytes(discovery.pdfPath, bytes);

    // 6e. Verify
    if (shouldBackup !== false) {
      const verified = await verifyWrittenPdf(discovery.pdfPath, result.pageCount);
      if (!verified) {
        await restoreBackup(discovery.pdfPath);
        if (shouldSaveDebug) {
          await saveWriteLog(item.id, {
            timestamp: new Date().toISOString(),
            action: "write",
            itemId: item.id,
            success: false,
            details: "Verification failed after write",
          });
        }
        writeProgress.close();
        showError(getString("error-pdf-verify"), 15000);
        return;
      }

      // 6f. Remove backup on success
      await removeBackup(discovery.pdfPath);
    }

    // 6g. Save debug copy
    if (shouldSaveDebug) {
      saveModifiedPdf(item.id, bytes);
      await saveWriteLog(item.id, {
        timestamp: new Date().toISOString(),
        action: "write",
        itemId: item.id,
        success: true,
        details: `${result.itemCount} items written (${result.pageCount} pages)`,
      });
    }

    writeProgress.close();

    // ── Step 7: Show result ────────────────────────────────────────
    const resultWin = new ztoolkit.ProgressWindow(config.addonName, {
      closeOnClick: true,
      closeTime: 20000,
    });

    resultWin
      .createLine({
        text: `✓ ${getString("result-written", { args: { count: result.itemCount } })}`,
        type: "success",
        progress: 100,
      })
      .createLine({
        text: `  ${result.pageCount} pages, ${totalNodes} outline entries`,
        type: "default",
        progress: 100,
      });

    const maxPreview = Math.min(tree.length, 3);
    for (let i = 0; i < maxPreview; i++) {
      resultWin.createLine({
        text: `  ${"  ".repeat(tree[i].level - 1)}├─ ${tree[i].title} (p.${tree[i].page})`,
        type: "default",
        progress: 100,
      });
    }

    resultWin.show();
  } catch (err) {
    ztoolkit.log(err);
    const shouldBackup = getPref("outline.backup");
    try {
      if (shouldBackup !== false) {
        await restoreBackup(discovery.pdfPath);
      }
    } catch {
      // ignore restore failure
    }
    if (getPref("outline.debug")) {
      await saveWriteLog(item.id, {
        timestamp: new Date().toISOString(),
        action: "write",
        itemId: item.id,
        success: false,
        details: (err as Error).message,
      });
    }
    writeProgress.close();
    showError(getString("error-unexpected"), 15000);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function showError(text: string, closeTime: number): void {
  new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime,
  })
    .createLine({ text, type: "error", progress: 100 })
    .show();
}

async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const io = (globalThis as any).IOUtils;
  if (io?.read) {
    const data = await io.read(filePath);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }
  throw new Error("IOUtils.read not available");
}

async function writeFileBytes(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  const io = (globalThis as any).IOUtils;
  if (io?.write) {
    await io.write(filePath, data, { tmpPath: filePath + ".tmp" });
  } else {
    throw new Error("IOUtils.write not available");
  }
}