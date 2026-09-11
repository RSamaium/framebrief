import type { Region } from "./types";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function formatTime(seconds: number, precise = false): string {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${precise ? `,${tenths}` : ""}`;
}

export function normalizeRegion(region: Region): Region {
  const x = clamp(region.x, 0, 1);
  const y = clamp(region.y, 0, 1);
  const clean = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return {
    x: clean(x),
    y: clean(y),
    width: clean(clamp(region.width, 0, 1 - x)),
    height: clean(clamp(region.height, 0, 1 - y)),
  };
}

export function isValidRegion(region: Region): boolean {
  return (
    [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  );
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
