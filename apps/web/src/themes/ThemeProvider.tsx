"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

import { minimalTheme } from "./minimal";
import { starkTheme } from "./stark";
import type { ThemeDefinition, ThemeName } from "./types";

const themes: Record<ThemeName, ThemeDefinition> = {
  stark: starkTheme,
  minimal: minimalTheme,
};

type ThemeContextValue = {
  theme: ThemeDefinition;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>("stark");
  const theme = themes[themeName];

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.style.colorScheme = themeName === "stark" ? "dark" : "light";
  }, [themeName]);

  function setTheme(name: ThemeName) {
    setThemeName(name);
  }

  return <ThemeContext.Provider value={{ theme, themeName, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe utilizarse dentro de ThemeProvider.");
  }
  return context;
}