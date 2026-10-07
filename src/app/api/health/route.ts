import { prisma, leadsDb } from "@/lib/db";

/**
 * Liveness + readiness probe (production launch; the health half of Story 5.6).
 *
 * Polled by the container healthcheck (docker-compose.prod.yml) and by an external
 * uptime monitor. Under `/api`, so the proxy matcher never locale-routes it.
 *
 * Checks the two things that turn a running process into a working site:
 *  - `database`: the catalog store answers (`SELECT 1`);
 *  - `leads`: the leads store answers AND was MIGRATED — reading
 *    `lead_reference_seq` proves the table + sequence exist, so a forgotten
 *    `migrate deploy` on a separate leads database (Story 5.3) is caught here
 *    instead of surfacing as a 500 on the first RFQ.
 *
 * ⚠️ Says nothing beyond ok/fail per check — no error text, hostnames or versions:
 * the endpoint is public. Details go to the server log.
 *
 * 200 when every check passes, 503 otherwise. Never cached.
 */
export const dynamic = "force-dynamic";

type Check = "ok" | "fail";

async function check(name: string, probe: () => Promise<unknown>): Promise<Check> {
  try {
    await probe();
    return "ok";
  } catch (error) {
    console.error(`[health] ${name} check failed:`, error);
    return "fail";
  }
}

export async function GET(): Promise<Response> {
  const [database, leads] = await Promise.all([
    check("database", () => prisma.$queryRaw`SELECT 1`),
    check("leads", () => leadsDb.$queryRaw`SELECT last_value FROM lead_reference_seq`),
  ]);
  const ok = database === "ok" && leads === "ok";
  return Response.json(
    { status: ok ? "ok" : "fail", checks: { database, leads } },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
