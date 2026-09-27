import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { buildDatasetExport } from "@/server/admin/backup/export";

/**
 * `GET /[locale]/admin/settings/export` — the full-dataset JSON backup (Story
 * 4.9, FR36c). `requireAdmin` (401 otherwise; the proxy also gates
 * /[locale]/admin). Buffered (scale is trivial); never cached. Export-only — this
 * produces a re-importable file, it does not import or mutate.
 */
export async function GET() {
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

  const dataset = await buildDatasetExport();
  const date = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(dataset, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="glh-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
