import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/**
 * Hand-wired zod → react-hook-form resolver (Story 3.2, Task 0 #4).
 *
 * `@hookform/resolvers` is deliberately NOT a dependency — this is the whole of
 * what the RFQ form needs from it, and adding a package mid-story is the
 * unnamed-dependency HALT condition. REUSABLE: Epic 4's admin forms should
 * import this rather than re-wiring it (same schema-shared-with-endpoint
 * pattern).
 *
 * Contracts a consumer must know:
 *
 * - `message` carries the schema's STABLE ERROR KEY, never prose — render it
 *   through `t(`errors.${key}`)` (the shared-schema localization doctrine in
 *   `@/server/rfq/schema.ts`).
 * - Errors land on the TOP-LEVEL field (`issue.path[0]`): every registered RFQ
 *   field is top-level, and mapping a nested path (`equipment.2.text`) onto its
 *   parent guarantees the error reaches a field that exists in the DOM — which
 *   is what `shouldFocusError` needs to land focus somewhere real. First issue
 *   per field wins.
 * - On success the resolver returns the schema's PARSED OUTPUT (trimmed,
 *   defaulted, transformed), so `handleSubmit(onValid)` receives exactly what
 *   the endpoint's own `safeParse` would produce — one validation truth.
 * - An optional `normalize` runs before parsing: the form's raw values speak
 *   DOM (`""` for an unselected <select>), the schema speaks intent
 *   (`undefined` for absent) — the bridge lives here so neither side bends.
 */
export function zodResolver<TFieldValues extends FieldValues, TOutput>(
  schema: z.ZodType<TOutput>,
  normalize?: (values: TFieldValues) => unknown,
): Resolver<TFieldValues, unknown, TOutput> {
  return (values) => {
    const parsed = schema.safeParse(normalize ? normalize(values) : values);

    if (parsed.success) {
      return { values: parsed.data, errors: {} };
    }

    const errors: Record<string, FieldError> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root");
      if (!(field in errors)) {
        errors[field] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {}, errors: errors as FieldErrors<TFieldValues> };
  };
}
