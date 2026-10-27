import { assert } from "chai";
import { config } from "../package.json";
import { ensureMenuIcon } from "../src/modules/menu";

const MENU_ID = `${config.addonRef}-generate-outline`;

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("should register the item context menu through Zotero.MenuManager", function () {
    const menuManager = (Zotero as any).MenuManager;
    assert.isOk(menuManager, "Zotero.MenuManager is unavailable");

    const registered: any[] =
      menuManager._menuManager.getCustomMenuOptions("main/library/item");
    // Zotero namespaces the menuID as `<pluginID>-<menuID>`
    const menu = registered.find((option: any) =>
      String(option.menuID).includes(MENU_ID),
    );

    assert.isOk(
      menu,
      `menu ${MENU_ID} is not registered; registered=[${registered
        .map((option: any) => option.menuID)
        .join(", ")}]`,
    );
    assert.equal(menu.pluginID, config.addonID);
    assert.lengthOf(menu.menus, 1);
    assert.equal(menu.menus[0].menuType, "menuitem");
    assert.equal(
      menu.menus[0].l10nID,
      `${config.addonRef}-menuitem-generate-outline`,
    );
  });

  it("should resolve the menu label from the plugin FTL file", function () {
    const win = Zotero.getMainWindow() as any;
    const LocalizationCtor =
      win?.Localization ?? (globalThis as any).Localization;
    assert.isOk(LocalizationCtor, "Localization is unavailable");

    const l10n = new LocalizationCtor([`${config.addonRef}-addon.ftl`], true);
    const [message] = l10n.formatMessagesSync([
      { id: `${config.addonRef}-menuitem-generate-outline` },
    ]);

    const label = message?.attributes?.find(
      (attribute: any) => attribute.name === "label",
    )?.value;

    assert.isOk(message, "menu label message is missing");
    assert.isString(label);
    assert.isAbove(label.length, 0);
  });

  it("should register the preferences pane", function () {
    const panes = (Zotero.PreferencePanes as any).pluginPanes ?? [];
    assert.isOk(
      panes.some((pane: any) => pane.pluginID === config.addonID),
      "preferences pane is not registered",
    );
  });
});

describe("menu icon rendering", function () {
  it("paints the embedded icon on the menu item", async function () {
    this.timeout(20000);

    const win: any = Zotero.getMainWindow();
    const doc: Document = win.document;
    const popup: any = doc.getElementById("zotero-itemmenu");
    assert.isOk(popup, "zotero-itemmenu not found");

    let item = Zotero.Items.getAll(Zotero.Libraries.userLibraryID)[0];
    if (!item) {
      item = new Zotero.Item("journalArticle");
      item.libraryID = Zotero.Libraries.userLibraryID;
      item.setField("title", "Icon check");
      await item.saveTx();
    }

    Zotero.MenuManager.updateMenuPopup(popup, "main/library/item", {
      getContext: () => ({
        items: [item],
        tabType: "library",
        tabID: "zotero-pane",
      }),
      skipGrouping: true,
    });

    const ours: any = [...popup.querySelectorAll("menuitem")].find((el: any) =>
      (el.getAttribute("data-l10n-id") || "").includes(
        "menuitem-generate-outline",
      ),
    );
    assert.isOk(ours, "menu item not built");

    ensureMenuIcon(ours);

    assert.include(ours.style.backgroundImage, "data:image/png;base64,");
    assert.equal(ours.style.backgroundSize, "16px 16px");
    assert.equal(ours.style.paddingLeft, "30px");
  });
});
