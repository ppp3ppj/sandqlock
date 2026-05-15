import { type Theme, theme, setTheme } from "./theme";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function ThemeSelect() {
  return (
    <select
      class="select select-bordered select-sm"
      value={theme()}
      onChange={(e) => setTheme(e.currentTarget.value as Theme)}
    >
      {THEMES.map((t) => (
        <option value={t.value}>{t.label}</option>
      ))}
    </select>
  );
}
