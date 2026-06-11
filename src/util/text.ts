import { randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

/** Lowercase, trim, drop filler words so "the Master Bedroom" == "master bedroom". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|my|a|an|please|to|in|at|on)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "a, b and c" for natural speech. */
export function joinSpoken(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
