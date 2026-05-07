/**
 * Street View uses the same radius as Customize → Shape, plus a small bump so it matches
 * the prism card family but reads a little softer than other widgets.
 */
const STREET_VIEW_RADIUS_BUMP_PX = 6;

export function streetViewBorderRadius(borderRadiusFromSettings: string | undefined): string {
  const raw = borderRadiusFromSettings?.trim();
  if (raw) return `calc(${raw} + ${STREET_VIEW_RADIUS_BUMP_PX}px)`;
  return `calc(var(--widget-radius) + ${STREET_VIEW_RADIUS_BUMP_PX}px)`;
}
