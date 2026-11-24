/** Props for the root `prism-widget` container. */
export function prismWidgetThemeProps(darkMode: boolean): { 'data-theme': 'light' | 'dark' } {
  return { 'data-theme': darkMode ? 'dark' : 'light' };
}

export function shellAccentFill(color: string, darkMode: boolean): string {
  return darkMode ? `${color}28` : `${color}14`;
}

export function shellAccentBorder(color: string, darkMode: boolean, kind: 'chip' | 'icon' = 'chip'): string {
  if (kind === 'icon') {
    return darkMode ? `${color}90` : `${color}55`;
  }
  return darkMode ? `${color}58` : `${color}38`;
}

export function shellNeutralBorder(darkMode: boolean): string {
  return darkMode ? 'var(--border-default)' : 'var(--border-subtle)';
}

export function filterPillBorder(active: boolean, color: string, darkMode: boolean): string {
  return active ? shellAccentBorder(color, darkMode, 'chip') : shellNeutralBorder(darkMode);
}

/** Prefer CSS variables so global dark tokens apply (replaces hardcoded #3E5060 / rgba shells). */
export const widgetSurface = {
  border: 'var(--border-subtle)',
  borderStrong: 'var(--border-default)',
  bgWidget: 'var(--bg-widget)',
  bgPanel: 'var(--bg-panel)',
  bgInput: 'var(--bg-input)',
} as const;