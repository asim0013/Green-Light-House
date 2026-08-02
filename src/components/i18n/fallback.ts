/**
 * Decision for the "shown in English" indicator (AC3/AC4).
 *
 * Sits on top of Story 1.2's resolver: a repository already coalesces a resolved
 * field into an `isFallback` boolean (true = the requested locale was missing and
 * the EN value is being shown). The notice renders exactly when that is true.
 * Kept as a pure, next-intl-free function so it is trivially unit-testable.
 */
export function shouldShowFallbackNotice(isFallback: boolean): boolean {
  return isFallback === true;
}
