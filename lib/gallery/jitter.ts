/** Vary a base delay ±spread (default 40%) so each demo run feels different. */
export function jitter(base: number, spread = 0.4): number {
  return Math.max(0, base + (Math.random() - 0.5) * 2 * base * spread);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
