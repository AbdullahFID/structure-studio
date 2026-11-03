// Reads the live design tokens so the 3D scene matches the CSS look and theme.
export function readViewerTheme() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    look: root.dataset.look === 'studio' ? 'studio' : 'drafting',
    dark: cs.colorScheme.includes('dark'),
    gridline: v('--gridline'),
    ink: v('--ink'),
    ink3: v('--ink-3'),
    gridMinor: v('--grid-minor'),
    gridMajor: v('--grid-major'),
  };
}
