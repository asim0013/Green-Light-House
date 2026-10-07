import { prisma } from "../src/lib/db";
import { ensureDefaultSla } from "../src/server/repositories/sla-bootstrap";

/**
 * Production bootstrap: create the default SLA process if — and only if — none
 * exists. Run by the `init` service in docker-compose.prod.yml on every deploy.
 * Never overwrites what an admin has edited; see `ensureDefaultSla`.
 */
async function main(): Promise<void> {
  const outcome = await prisma.$transaction((tx) => ensureDefaultSla(tx));
  console.log(
    outcome === "created"
      ? "[ensure-sla] no SLA process found — created the default (edit it in Admin → Settings)"
      : "[ensure-sla] SLA process exists — left untouched",
  );
}

main()
  .catch((error: unknown) => {
    console.error("[ensure-sla] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
