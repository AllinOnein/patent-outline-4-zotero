import { initLocale, getString } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPatentMenu, unregisterPatentMenu } from "./modules/menu";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { ICON_APP } from "./utils/icons";

/**
 * FTL files that must be available inside the main window:
 * - `addon.ftl` holds the context-menu label (referenced by `l10nID`)
 * - `mainWindow.ftl` holds main-window specific strings
 */
const MAIN_WINDOW_FTL = ["addon.ftl", "mainWindow.ftl"];

function getFTLNames(): string[] {
  return MAIN_WINDOW_FTL.map((file) => `${addon.data.config.addonRef}-${file}`);
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // The pane icon must point at a file that actually ships with the plugin
  await Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: ICON_APP,
  });

  // Menus registered through Zotero.MenuManager are global, not per window
  registerPatentMenu();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
  Zotero.debug(
    `[${addon.data.config.addonName}] Startup complete (Zotero ${Zotero.version})`,
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  // Zotero 10 consolidates plugin FTL files into one localization source; the
  // window still has to opt in before `data-l10n-id` attributes resolve.
  for (const ftl of getFTLNames()) {
    win.MozXULElement.insertFTLIfNeeded(ftl);
  }
}

async function onMainWindowUnload(win: Window): Promise<void> {
  for (const ftl of getFTLNames()) {
    win.document.querySelector(`[href="${ftl}"]`)?.remove();
  }
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  unregisterPatentMenu();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  delete Zotero[addon.data.config.addonInstance as keyof typeof Zotero];
}

function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {
}

function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
  }
}

function onShortcuts(_type: string) {
}

function onDialogEvents(_type: string) {
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
