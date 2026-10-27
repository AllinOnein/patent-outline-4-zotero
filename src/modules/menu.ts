import { config } from "../../package.json";
import { getString, getLocaleID } from "../utils/locale";
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
import { closeOpenReaders, reopenReaders } from "./readerSync";
import { ICON_MENU_DARK, ICON_MENU_LIGHT } from "../utils/icons";

const PREFS_PREFIX = config.prefsPrefix;

/** Safe logger: the toolkit is undefined when this module runs in unit tests. */
function debugLog(...args: any[]): void {
  if (typeof ztoolkit !== "undefined") {
    ztoolkit.log(...args);
  }
}

/** Menu ID is plugin-scoped so it can be unregistered on shutdown. */
const MENU_ID = `${config.addonRef}-generate-outline`;

/**
 * Key returned by `registerMenu()`. Zotero namespaces it as
 * `<pluginID>-<menuID>` (CSS-escaped), and `unregisterMenu()` expects that
 * namespaced key rather than the bare menuID.
 */
let registeredMenuKey: string | null = null;

function getPref(key: string): any {
  try {
    return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
  } catch {
    return undefined;
  }
}

/**
 * Register the "generate outline" entry in the item context menu.
 *
 * Zotero 8 introduced `Zotero.MenuManager`; Zotero 10 (re)builds these menus
 * itself and removes a plugin's menu DOM on shutdown, so the legacy DOM
 * insertion used by `ztoolkit.Menu` (removed in zotero-plugin-toolkit 6) is no
 * longer needed.
 */
export function registerPatentMenu(): void {
  const menuManager = (Zotero as any).MenuManager;
  if (!menuManager?.registerMenu) {
    debugLog(
      "[menu] Zotero.MenuManager is unavailable — Patent Outline Generator requires Zotero 8 or later.",
    );
    return;
  }

  // Zotero keeps the registration from the previous plugin instance when the
  // plugin is updated without a full restart. Registering the same menuID again
  // is rejected, which would leave the stale menu (and its old icon) in place,
  // so clear anything registered under our ID first.
  clearStaleRegistrations(menuManager);

  const key = menuManager.registerMenu({
    menuID: MENU_ID,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menuitem-generate-outline"),
        onShowing: (_event: Event, context: any) => {
          // Zotero's `icon` option only sets `list-style-image`, which does not
          // paint in the item context menu on some builds. Drawing the icon as
          // a background image on the item works everywhere.
          ensureMenuIcon(context?.menuElem);

          const items: Zotero.Item[] = context?.items ?? [];
          // Nothing to do for attachments, notes or annotations on their own
          context?.setVisible?.(items.some((item) => item.isRegularItem()));
        },
        onCommand: (_event: Event, context: any) => {
          const items: Zotero.Item[] = context?.items?.length
            ? context.items
            : getSelectedItems();
          void handleGenerateOutline(items);
        },
      },
    ],
  }) as string | false;

  if (!key) {
    debugLog("[menu] failed to register the item context menu");
    return;
  }
  registeredMenuKey = key;
  Zotero.debug(`[${config.addonName}] Item context menu registered: ${key}`);
}

const MENU_ICON_SIZE = 16;
const MENU_ICON_INSET = 8;
const MENU_ICON_PADDING = MENU_ICON_INSET + MENU_ICON_SIZE + 6;

/**
 * Paint the icon on the menu item itself.
 *
 * `Zotero.MenuManager`'s `icon` option ends up as a `list-style-image` on the
 * item, which stays blank in the item context menu on some Zotero/Windows
 * builds. A background image is painted by the element directly, so it does not
 * depend on that rule, and a data URL keeps it independent of chrome:// paths.
 */
export function ensureMenuIcon(menuElem: any): void {
  if (!menuElem?.style) return;

  try {
    const win = menuElem.ownerDocument?.defaultView;
    const dark = Boolean(
      win?.matchMedia?.("(prefers-color-scheme: dark)")?.matches,
    );
    const icon = dark ? ICON_MENU_DARK : ICON_MENU_LIGHT;

    menuElem.style.backgroundImage = `url("${icon}")`;
    menuElem.style.backgroundRepeat = "no-repeat";
    menuElem.style.backgroundPosition = `${MENU_ICON_INSET}px center`;
    menuElem.style.backgroundSize = `${MENU_ICON_SIZE}px ${MENU_ICON_SIZE}px`;
    menuElem.style.paddingLeft = `${MENU_ICON_PADDING}px`;
  } catch (err) {
    debugLog("[menu] failed to apply the menu icon", err);
  }
}

/**
 * Drop menu registrations left behind by an earlier instance of this plugin.
 * Their cache keys are namespaced (`<pluginID>-<menuID>`), which is also what
 * `unregisterMenu()` expects, so the stored keys are used as-is.
 */
function clearStaleRegistrations(menuManager: any): void {
  try {
    const cache = menuManager?._menuManager?._optionsCache;
    if (!cache) return;

    for (const key of Object.keys(cache)) {
      const option = cache[key];
      if (!option || option.pluginID !== config.addonID) continue;
      if (!String(option.menuID ?? "").includes(MENU_ID)) continue;

      menuManager.unregisterMenu(key);
      debugLog(`[menu] removed stale registration: ${key}`);
    }
  } catch (err) {
    debugLog("[menu] failed to clear stale registrations", err);
  }
}

/** Remove the context menu entry (called on shutdown). */
export function unregisterPatentMenu(): void {
  try {
    (Zotero as any).MenuManager?.unregisterMenu?.(registeredMenuKey ?? MENU_ID);
  } catch (err) {
    debugLog("[menu] failed to unregister menu", err);
  }
  registeredMenuKey = null;
}

/** Currently selected items in the active main window (empty if unavailable). */
function getSelectedItems(): Zotero.Item[] {
  try {
    return Zotero.getActiveZoteroPane()?.getSelectedItems() ?? [];
  } catch (err) {
    debugLog("[menu] failed to read selection", err);
    return [];
  }
}

async function handleGenerateOutline(
  selectedItems?: Zotero.Item[],
): Promise<void> {
  // ── Step 0: Validate selection ──────────────────────────────────
  const items: Zotero.Item[] = selectedItems?.length
    ? selectedItems
    : getSelectedItems();

  if (items.length === 0) {
    showError(getString("error-no-item-selected"), 5000);
    return;
  }

  const regularItems = items.filter((selected) => selected.isRegularItem());

  if (regularItems.length === 0) {
    const only = items[0];
    showError(
      only.isAttachment()
        ? getString("error-is-attachment")
        : getString("error-no-item-selected"),
      5000,
    );
    return;
  }

  if (regularItems.length > 1) {
    showError(getString("error-multiple-items"), 8000);
    return;
  }

  const item = regularItems[0];

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
    .createLine({
      text: getString("progress-discovering"),
      type: "default",
      progress: 10,
    })
    .show();

  let discovery: Awaited<ReturnType<typeof discoverAttachments>>;
  try {
    discovery = await discoverAttachments(item);
  } catch (err) {
    progress.close();
    debugLog(err);
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
    debugLog(err);
    progress.close();
    const msg = (err as Error).message || String(err);
    let title = getString("error-ai-failed");
    if (/timeout|timed out/i.test(msg)) {
      title = getString("error-ai-timeout");
    } else if (/API key|401|403/i.test(msg)) {
      title = getString("error-ai-invalidkey");
    }
    showErrorDetail(title, msg, 20000);
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
    debugLog("[tree] validation:", validationError);
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
        .createLine({
          text: getString("result-cancelled"),
          type: "default",
          progress: 100,
        })
        .show();
      return;
    }

    if (action === "export") {
      const path = shouldSaveDebug
        ? await saveBookmarkTree(item.id, tree)
        : null;
      if (path) {
        new ztoolkit.ProgressWindow(config.addonName, {
          closeOnClick: true,
          closeTime: 5000,
        })
          .createLine({
            text: `${getString("result-exported")}: ${path}`,
            type: "default",
            progress: 100,
          })
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
    .createLine({
      text: "Writing outline to PDF...",
      type: "default",
      progress: 30,
    })
    .show();

  // The reader holds the PDF file open while it is displayed, and would keep
  // showing the outline loaded at open time. Close those tabs and restore them
  // once the new file is on disk.
  const pdfItemID = discovery.pdfItem.id;
  const readerSnapshots = closeOpenReaders(pdfItemID);

  try {
    const shouldBackup = getPref("outline.backup");

    // 6a. Backup (if enabled)
    if (shouldBackup !== false) {
      writeProgress.changeLine({
        text: "Backing up original PDF...",
        progress: 40,
      });
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
      const verified = await verifyWrittenPdf(
        discovery.pdfPath,
        result.pageCount,
      );
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

    if (outlineResult.stats?.truncated) {
      resultWin.createLine({
        text: `  ${getString("result-downsampled", { args: { selected: outlineResult.stats.selected, total: outlineResult.stats.total } })}`,
        type: "default",
        progress: 100,
      });
    }

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
    debugLog(err);
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
  } finally {
    await reopenReaders(pdfItemID, readerSnapshots);
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

/** Error toast that also shows the underlying reason (API status, parse error, …). */
function showErrorDetail(
  title: string,
  detail: string,
  closeTime: number,
): void {
  const win = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime,
  }).createLine({ text: title, type: "error", progress: 100 });

  if (detail) {
    win.createLine({
      text: detail.length > 260 ? `${detail.slice(0, 260)}…` : detail,
      type: "default",
      progress: 100,
    });
  }

  win.show();
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
