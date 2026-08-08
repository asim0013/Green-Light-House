import type { ButtonHTMLAttributes } from "react";
import { ArrowRight } from "lucide-react";
import { buttonClasses, type ButtonVariant } from "./buttonClasses";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Base button (Story 1.5). Variants per DESIGN.md; the `link` variant renders an
 * inline text CTA with a trailing arrow. Anchor-based CTAs in feature stories can
 * reuse `buttonClasses(variant)` directly on an <a>.
 */
export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  return (
    <button className={buttonClasses(variant, className)} {...props}>
      {children}
      {variant === "link" && <ArrowRight size={14} aria-hidden />}
    </button>
  );
}
