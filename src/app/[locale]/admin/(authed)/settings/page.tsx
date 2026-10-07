import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { SiteSettingsForm } from "@/components/admin/settings/SiteSettingsForm";
import { SlaEditor } from "@/components/admin/settings/SlaEditor";
import { BulkImportForm } from "@/components/admin/settings/BulkImportForm";
import { getSiteSettingsForEdit } from "@/server/repositories/site-settings";
import { getSlaForEdit } from "@/server/repositories/sla";

/**
 * Operational settings (Story 4.8 — FR36b). Two editors on one surface: the
 * `SiteSettings` values (contact/phone/notify) and the SLA process/steps. The
 * `(authed)` layout guards; each save revalidates its own tag (`settings` /
 * `sla`) so edits go live with no deploy.
 */
export default async function SettingsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  const [settings, sla] = await Promise.all([getSiteSettingsForEdit(), getSlaForEdit()]);
  return (
    <>
      <AdminTopbar title="Settings" subtitle="Operations · Contact, phone, notifications & SLA" />
      <SiteSettingsForm initial={settings} />
      <div className="border-t border-border-subtle">
        <AdminTopbar
          title="Response process (SLA)"
          subtitle="Operations · Editable process steps shown in place of prices"
        />
        {sla ? (
          <SlaEditor initial={sla} />
        ) : (
          <p className="p-8 text-[13px] text-ink-2">
            No SLA process found — run <code>db:seed</code>.
          </p>
        )}
      </div>
      <div className="border-t border-border-subtle">
        <AdminTopbar
          title="Backup / Export"
          subtitle="Operations · Download the full dataset (Story 4.9)"
        />
        <div className="flex max-w-2xl flex-col gap-3 p-8">
          <p className="text-[13px] text-ink-2">
            Downloads the full catalog, content and leads as one re-importable JSON file for backup
            or migration. Admin credentials are never included. Stored attachment and media objects
            are backed up separately at the storage layer, not in this file.
          </p>
          {/* A PLAIN anchor (not next-intl <Link>) so the browser does a full GET and the
              attachment downloads, rather than a client-side navigation to a file route. The
              locale prefix is required — the route lives under /[locale]/admin. */}
          <a
            href={`/${locale}/admin/settings/export`}
            download
            className="self-start rounded bg-ink px-4 py-2 font-mono text-[13px] uppercase tracking-[0.08em] text-surface"
          >
            Export full dataset (JSON)
          </a>
        </div>
      </div>
      <div className="border-t border-border-subtle">
        <AdminTopbar
          title="Bulk import"
          subtitle="Operations · Product audit CSV / Excel (Story 4.10)"
        />
        <BulkImportForm locale={locale} />
      </div>
    </>
  );
}
