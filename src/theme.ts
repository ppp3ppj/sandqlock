import { createSignal } from "solid-js";
import { load } from "@tauri-apps/plugin-store";

export type Theme = "light" | "dark";

const STORE_FILE = "settings.json";
const THEME_KEY = "theme";
const DEFAULT_THEME: Theme = "light";

const [theme, setThemeSignal] = createSignal<Theme>(DEFAULT_THEME);

export { theme };

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  setThemeSignal(t);
}

export async function initTheme() {
  const store = await load(STORE_FILE);
  const saved = await store.get<Theme>(THEME_KEY);
  applyTheme(saved ?? DEFAULT_THEME);
}

export async function setTheme(t: Theme) {
  applyTheme(t);
  const store = await load(STORE_FILE);
  await store.set(THEME_KEY, t);
}
