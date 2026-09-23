"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

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
const THEME_STORAGE_KEY = "taskflow_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeName = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const theme = themes[themeName];

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.style.colorScheme = themeName === "stark" ? "dark" : "light";
  }, [themeName]);

  function setTheme(name: ThemeName) {
    window.localStorage.setItem(THEME_STORAGE_KEY, name);
    window.dispatchEvent(new Event("taskflow:theme-change"));
  }

  return <ThemeContext.Provider value={{ theme, themeName, setTheme }}>{children}</ThemeContext.Provider>;
}

function subscribeToTheme(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener("taskflow:theme-change", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("taskflow:theme-change", listener);
  };
}

function getThemeSnapshot(): ThemeName {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "minimal" ? "minimal" : "stark";
}

function getServerThemeSnapshot(): ThemeName {
  return "stark";
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe utilizarse dentro de ThemeProvider.");
  }
  return context;
}