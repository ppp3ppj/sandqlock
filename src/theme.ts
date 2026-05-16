import { createSignal } from "solid-js";
import { LazyStore } from "@tauri-apps/plugin-store";

export type Theme = "light" | "dark";

const DEFAULT_THEME: Theme = "light";
const store = new LazyStore("settings.json");

const [theme, setThemeSignal] = createSignal<Theme>(DEFAULT_THEME);

export { theme };

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  setThemeSignal(t);
}

export async function initTheme() {
  const saved = await store.get<Theme>("theme");
  applyTheme(saved ?? DEFAULT_THEME);
}

export async function setTheme(t: Theme) {
  applyTheme(t);
  await store.set("theme", t);
}
