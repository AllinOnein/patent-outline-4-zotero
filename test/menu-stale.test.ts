import { assert } from "chai";
import { registerPatentMenu } from "../src/modules/menu";

const MENU_ID = "patentplus-generate-outline";

function findOptions(): any[] {
  const cache = (Zotero as any).MenuManager?._menuManager?._optionsCache ?? {};
  return Object.keys(cache)
    .filter((key) => String(cache[key]?.menuID ?? "").includes(MENU_ID))
    .map((key) => cache[key]);
}

describe("stale menu registration", function () {
  it("replaces a registration left over from a previous plugin instance", function () {
    const menuManager: any = (Zotero as any).MenuManager;

    // Drop the live registration and put a stale one in its place, mimicking
    // what Zotero keeps when a plugin is updated without a restart
    for (const key of Object.keys(
      menuManager._menuManager?._optionsCache ?? {},
    )) {
      const option = menuManager._menuManager._optionsCache[key];
      if (String(option?.menuID ?? "").includes(MENU_ID)) {
        menuManager.unregisterMenu(key);
      }
    }

    menuManager.registerMenu({
      menuID: MENU_ID,
      pluginID: "patentplus@patentplus.dev",
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "patentplus-menuitem-generate-outline",
          icon: "chrome://patentplus/content/icons/does-not-exist.svg",
        },
      ],
    });

    const stale = findOptions();
    assert.lengthOf(stale, 1);
    assert.include(stale[0].menus[0].icon, "does-not-exist");

    registerPatentMenu();

    const current = findOptions();
    assert.lengthOf(current, 1, "stale registration should be replaced");
    assert.equal(
      current[0].menus[0].l10nID,
      "patentplus-menuitem-generate-outline",
    );
  });
});
