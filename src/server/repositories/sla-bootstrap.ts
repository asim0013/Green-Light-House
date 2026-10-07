import type { Prisma } from "@prisma/client";
import { SLA_PROCESS_KEY, SLA_PROCESS_TEXT, SLA_STEPS } from "../../../scripts/sla-fixtures";

/**
 * Production SLA bootstrap — create the response process ONLY IF IT IS ABSENT.
 *
 * WHY THIS EXISTS: the SLA ("Technical review in 24 h · specced proposal in 3
 * working days") is the business's real commitment and five public surfaces read
 * it, but the admin can only EDIT an existing process (Story 4.8), and the only
 * thing that ever created one was `prisma/seed.ts` — which production must never
 * run, because the rest of the seed is demo catalog. On an empty production
 * database every SLA surface would simply be blank. The `init` service in
 * docker-compose.prod.yml calls this (via `scripts/ensure-sla.ts`) on every deploy.
 *
 * ⚠️ NEVER AN UPSERT. Once the process exists — whether created here or edited
 * in Admin → Settings — this does nothing at all, so a redeploy can never put
 * back text the owner has changed. That is the difference from the seed, whose
 * upserts deliberately repair rows to the fixture copy.
 *
 * The copy comes from `scripts/sla-fixtures.ts`, the single source the AC5
 * hygiene gate polices; nothing is retyped here.
 *
 * Takes the client as a parameter so the caller decides the transaction (the
 * script wraps it in one; the test wraps it in one it rolls back).
 */
export async function ensureDefaultSla(
  db: Prisma.TransactionClient,
): Promise<"exists" | "created"> {
  const existing = await db.slaProcess.findUnique({
    where: { key: SLA_PROCESS_KEY },
    select: { id: true },
  });
  if (existing) return "exists";

  await db.slaProcess.create({
    data: {
      key: SLA_PROCESS_KEY,
      translations: {
        create: SLA_PROCESS_TEXT.map(({ locale, kicker, summary }) => ({
          locale,
          kicker,
          summary,
        })),
      },
      steps: {
        create: SLA_STEPS.map((step) => ({
          sort: step.sort,
          translations: {
            create: step.text.map(({ locale, badge, title, description }) => ({
              locale,
              badge,
              title,
              description,
            })),
          },
        })),
      },
    },
  });
  return "created";
}
