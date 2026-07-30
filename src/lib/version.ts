/**
 * Trivial module so the toolchain (typecheck + Vitest) has real source to exercise
 * from Story 1.1. Replace/extend as real `lib` utilities land in later stories.
 */
export const APP_NAME = "GREENLIGHTHOUSE" as const;

export function greeting(name: string): string {
  return `Hello, ${name}`;
}
