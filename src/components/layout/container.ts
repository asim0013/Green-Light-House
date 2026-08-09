/**
 * The single content column shared by the chrome (header/footer) and page bodies
 * (Story 1.6 review).
 *
 * DESIGN.md § Layout: 1440 canvas, `gutter-x: 100`, `content-max: 1240`. Modelled
 * as a full-bleed 1440 FRAME with 100px horizontal padding, so at 1440 the content
 * box is exactly 1240 running x=100…1340. The gutter steps down below that
 * (EXPERIENCE § Responsive: the gutter shrinks proportionally) — 40px from `md`,
 * which also keeps the inline nav inside its box at 1280.
 *
 * NOTE: `max-w` must be the OUTER frame, not the content width. `max-w-[1240px]`
 * plus padding yields a 1192 content column at a 124px gutter, missing DESIGN on
 * both numbers.
 */
export const CONTAINER = "mx-auto w-full max-w-[1440px] px-6 md:px-10 min-[1440px]:px-[100px]";
