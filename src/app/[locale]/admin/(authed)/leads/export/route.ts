import type { LeadStatus } from "@prisma/client";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { listLeadsForExport } from "@/server/repositories/lead";
import { leadsToCsv } from "@/server/admin/leads/csv";

/**
 * `GET /[locale]/admin/leads/export[?status=]` — CSV export of leads (Story 4.7,
 * FR36a). `requireAdmin` (401 otherwise; the proxy also gates /[locale]/admin).
 * Honors the optional status filter; newest-first; formula-injection-guarded by
 * `leadsToCsv`. Never cached.
 */
const STATUSES = ["new", "in_review", "quoted", "closed"] as const;

function parseStatus(value: string | null): LeadStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as LeadStatus)
    : undefined;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }

  const status = parseStatus(new URL(request.url).searchParams.get("status"));
  const rows = await listLeadsForExport(status);
  const csv = leadsToCsv(rows);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
