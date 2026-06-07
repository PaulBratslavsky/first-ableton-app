// One distinct color per pitch-class, shared across all four views so the same
// note reads as the same color on piano, guitar, bass, and the staff.

import { pitchClass } from './music'

/** 12 vibrant, well-separated hues (chromatic order, C..B). */
export const PITCH_COLORS = [
  '#ef4444', // C  red
  '#f97316', // C# orange
  '#f59e0b', // D  amber
  '#eab308', // D# yellow
  '#84cc16', // E  lime
  '#22c55e', // F  green
  '#14b8a6', // F# teal
  '#06b6d4', // G  cyan
  '#3b82f6', // G# blue
  '#6366f1', // A  indigo
  '#a855f7', // A# purple
  '#ec4899', // B  pink
] as const

/** Color for a MIDI pitch (by its pitch-class). */
export function pitchColor(pitch: number): string {
  return PITCH_COLORS[pitchClass(pitch)]
}

/** Relative luminance (0..1) of a #rrggbb color. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Readable text color (near-black or white) to place on top of `hex`. */
export function textOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#0a0a0c' : '#ffffff'
}
