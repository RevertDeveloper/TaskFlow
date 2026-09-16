export type ThemeName = "stark" | "minimal";

export type ThemeTokens = {
  colorCanvas: string;
  colorSurface: string;
  colorSurfaceRaised: string;
  colorSurfaceMuted: string;
  colorInk: string;
  colorInkMuted: string;
  colorAccent: string;
  colorAccentStrong: string;
  colorFocus: string;
  colorDanger: string;
  colorGlow: string;
  colorBorder: string;
  shadowPanel: string;
  fontBody: string;
  fontDisplay: string;
};

export type ThemeDefinition = {
  name: ThemeName;
  label: string;
  tokens: ThemeTokens;
};