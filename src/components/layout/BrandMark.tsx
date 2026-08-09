/**
 * Brand mark + wordmark (Story 1.6 review — extracted so header and footer share
 * one definition; DESIGN.md § Components already flagged "promote to one
 * component"). The 26px green box is the ONLY sanctioned use of `brand` green.
 */
export function BrandMark({ tone = "light" }: { tone?: "light" | "onDark" }) {
  return (
    <>
      <span
        aria-hidden
        className="flex size-[26px] shrink-0 items-center justify-center bg-brand text-[15px] font-bold text-white"
      >
        G
      </span>
      <span
        className={`font-heading text-lg font-bold tracking-tight ${
          tone === "onDark" ? "text-white" : "text-ink"
        }`}
      >
        GREENLIGHTHOUSE
      </span>
    </>
  );
}
