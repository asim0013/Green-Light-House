import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { SiteSettingsForm } from "@/components/admin/settings/SiteSettingsForm";
import { SlaEditor } from "@/components/admin/settings/SlaEditor";
import { getSiteSettingsForEdit } from "@/server/repositories/site-settings";
import { getSlaForEdit } from "@/server/repositories/sla";

/**
 * Operational settings (Story 4.8 — FR36b). Two editors on one surface: the
 * `SiteSettings` values (contact/phone/notify) and the SLA process/steps. The
 * `(authed)` layout guards; each save revalidates its own tag (`settings` /
 * `sla`) so edits go live with no deploy.
 */
export default async function SettingsPage() {
  const [settings, sla] = await Promise.all([getSiteSettingsForEdit(), getSlaForEdit()]);
  return (
    <>
      <AdminTopbar title="Settings" subtitle="Operations · Contact, phone, notifications & SLA" />
      <SiteSettingsForm initial={settings} />
      <div className="border-t border-border-subtle">
        <AdminTopbar title="Response process (SLA)" subtitle="Operations · Editable process steps shown in place of prices" />
        {sla ? (
          <SlaEditor initial={sla} />
        ) : (
          <p className="p-8 text-[13px] text-ink-2">
            No SLA process found — run <code>db:seed</code>.
          </p>
        )}
      </div>
    </>
  );
}
