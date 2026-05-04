/** Design tokens for Xstream visual language. */
export const tokens = {
  // Backgrounds
  colorBg0: "#050706",
  colorBg1: "#0a0d0c",
  colorSurface: "#14181a",
  colorSurface2: "#1a1f1c",

  // Borders
  colorBorder: "#25302a",
  colorBorderSoft: "rgba(37, 48, 42, 0.5)",

  // Green accent (primary)
  colorGreen: "oklch(0.78 0.20 150)",
  colorGreenDeep: "oklch(0.45 0.13 150)",
  colorGreenSoft: "oklch(0.78 0.20 150 / 0.12)",
  colorGreenGlow: "oklch(0.78 0.20 150 / 0.35)",
  colorGreenInk: "#050706",

  // Foreground
  colorText: "#e8eee8",
  colorTextDim: "#9aa6a0",
  colorTextMuted: "#6a766f",
  colorTextFaint: "#46504b",

  // Status
  colorYellow: "#f5c518",
  colorRed: "#ff5d6c",

  // Type
  fontHead: "'Anton', sans-serif",
  fontBody: "'Inter', sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
  fontDisplay: "'Bytesized', system-ui, sans-serif",
  fontNav: "'Science Gothic', system-ui, sans-serif",

  // Geometry
  radiusSm: "2px",
  radiusMd: "4px",
  radiusFull: "999px",
  space2: "8px",
  space3: "12px",
  space5: "24px",

  // Animation
  transition: "0.15s",
  transitionSlow: "0.25s",

  // Layout
  headerHeight: "52px",
} as const;

export type Tokens = typeof tokens;
