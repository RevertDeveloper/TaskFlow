"use client";

import { useTheme } from "@/themes/ThemeProvider";
import type { ThemeName } from "@/themes/types";

const themeOptions: { name: ThemeName; label: string }[] = [
  { name: "stark", label: "Stark" },
  { name: "minimal", label: "Minimal" },
];

export function ThemeSwitcher() {
  const { themeName, setTheme } = useTheme();

  return (
    <div className="theme-switcher" role="group" aria-label="Tema visual">
      {themeOptions.map((option) => (
        <button
          key={option.name}
          type="button"
          aria-pressed={themeName === option.name}
          onClick={() => setTheme(option.name)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}