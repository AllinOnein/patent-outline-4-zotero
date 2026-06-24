import { config } from "../../package.json";
import { callAI, type AIClientConfig } from "./aiClient";

const PREFS_PREFIX = config.prefsPrefix;

export async function registerPrefsScripts(_window: Window) {
  bindTestButton(_window);
  bindModeRadios(_window);
}

function bindTestButton(_window: Window) {
  const btn = _window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-ai-test`,
  ) as HTMLButtonElement;
  const resultLabel = _window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-ai-test-result`,
  ) as HTMLElement;

  if (!btn) return;

  btn.addEventListener("click", async () => {
    resultLabel.textContent = "Testing...";
    resultLabel.style.color = "#888";

    const baseUrl = (
      _window.document.querySelector(
        `#zotero-prefpane-${config.addonRef}-ai-baseUrl`,
      ) as HTMLInputElement
    )?.value;
    const apiKey = (
      _window.document.querySelector(
        `#zotero-prefpane-${config.addonRef}-ai-apiKey`,
      ) as HTMLInputElement
    )?.value;
    const model = (
      _window.document.querySelector(
        `#zotero-prefpane-${config.addonRef}-ai-model`,
      ) as HTMLInputElement
    )?.value;

    if (!baseUrl || !apiKey || !model) {
      resultLabel.textContent = "Please fill in all fields";
      resultLabel.style.color = "red";
      return;
    }

    const prefs = (globalThis as any).Zotero?.Prefs;
    if (prefs) {
      prefs.set(`${PREFS_PREFIX}.ai.baseUrl`, baseUrl, true);
      prefs.set(`${PREFS_PREFIX}.ai.apiKey`, apiKey, true);
      prefs.set(`${PREFS_PREFIX}.ai.model`, model, true);
    }

    const aiConfig: AIClientConfig = { baseUrl, apiKey, model };

    try {
      const response = await callAI(aiConfig, [
        {
          role: "user",
          content: "Respond with exactly: OK",
        },
      ]);
      if (response.includes("OK")) {
        resultLabel.textContent = "Connection successful!";
        resultLabel.style.color = "green";
      } else {
        resultLabel.textContent = `Unexpected response: ${response.slice(0, 100)}`;
        resultLabel.style.color = "orange";
      }
    } catch (err) {
      resultLabel.textContent = `Failed: ${(err as Error).message.slice(0, 100)}`;
      resultLabel.style.color = "red";
    }
  });
}

function bindModeRadios(_window: Window) {
  const radios = _window.document.querySelectorAll(
    `#zotero-prefpane-${config.addonRef}-mode-group input[type="radio"]`,
  ) as NodeListOf<HTMLInputElement>;

  if (radios.length === 0) return;

  const prefKey = `${PREFS_PREFIX}.outline.mode`;
  const prefs = (globalThis as any).Zotero?.Prefs;

  const current = prefs?.get(prefKey, true) || "smart";
  radios.forEach((r: HTMLInputElement) => {
    r.checked = r.value === current;
    r.addEventListener("change", () => {
      if (r.checked) {
        prefs?.set(prefKey, r.value, true);
      }
    });
  });
}