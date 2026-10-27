import {
  BasicTool,
  ProgressWindowHelper,
  UITool,
  unregister,
} from "zotero-plugin-toolkit";
import { config } from "../../package.json";
import { ICON_APP } from "./icons";

export { createZToolkit };

/**
 * Minimal toolkit composed of the tools this plugin actually uses.
 *
 * `ZoteroToolkit` (the all-in-one helper) is only exported from the
 * `zotero-plugin-toolkit/ztoolkit` subpath, which ships without type
 * declarations. Composing the tools we need keeps the bundle small and typed.
 *
 * Note: the toolkit's `Menu` helper was removed in zotero-plugin-toolkit 6 —
 * context menus are registered through `Zotero.MenuManager` instead (Zotero 8+).
 */
class PatentToolkit extends BasicTool {
  UI: UITool;
  ProgressWindow = ProgressWindowHelper;

  constructor() {
    super();
    this.UI = new UITool(this);
  }

  unregisterAll() {
    unregister(this);
  }
}

function createZToolkit() {
  const _ztoolkit = new PatentToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const env = __env__;
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = env === "production";
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  // Getting basicOptions.debug will load global modules like the debug bridge.
  // since we want to deprecate it, should avoid using it unless necessary.
  // _ztoolkit.basicOptions.debug.disableDebugBridgePassword =
  //   __env__ === "development";
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI("default", ICON_APP);
}
