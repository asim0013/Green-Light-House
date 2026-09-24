import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { LeadStatusForm } from "@/components/admin/leads/LeadStatusForm";
import { getLeadForAdmin } from "@/server/repositories/lead";
import { labelOf, isEmptyPrefillContext } from "@/server/rfq/contracts";

// deliveryFailureReason carries stable CODES (Story 3.3) — mapped to inline English here.
const DELIVERY_TEXT: Record<string, string> = {
  "notify:provider": "Team notification: provider rejected the send",
  "notify:transport": "Team notification: network/transport failure",
  "notify:unconfigured": "Team notification: no recipient configured",
  "confirm:provider": "Sender confirmation: provider rejected the send",
  "confirm:transport": "Sender confirmation: network/transport failure",
  "confirm:unconfigured": "Sender confirmation: not configured",
};
function deliveryLines(reason: string | null): string[] {
  if (!reason) return [];
  return reason
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => DELIVERY_TEXT[c] ?? c);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 border-b border-border-subtle py-2">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">{label}</dt>
      <dd className="text-[14px] text-ink">{children}</dd>
    </div>
  );
}

export default async function LeadDetailPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const lead = await getLeadForAdmin(id);
  if (!lead) notFound();

  const att = lead.attachment;
  const failures = deliveryLines(lead.deliveryFailureReason);
  const fmt = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "—");

  return (
    <>
      <AdminTopbar title={lead.reference} subtitle={`Inquiry · ${lead.source}`} />
      <div className="flex max-w-3xl flex-col gap-8 p-8">
        <section className="rounded border border-border-subtle p-5">
          <LeadStatusForm id={lead.id} status={lead.status} />
        </section>

        <dl>
          <Row label="Received">{fmt(lead.createdAt)}</Row>
          <Row label="Company">{lead.company}</Row>
          <Row label="Contact">
            {lead.name} ·{" "}
            <a href={`mailto:${lead.email}`} className="underline">
              {lead.email}
            </a>
            {lead.phone ? ` · ${lead.phone}` : ""}
          </Row>
          <Row label="Country / locale">
            {lead.country ?? "—"} / {lead.locale ?? "—"}
          </Row>
          <Row label="Industry">{lead.industry ?? "—"}</Row>
          <Row label="Equipment">
            {lead.equipment.length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-wrap gap-2">
                {lead.equipment.map((item, i) => (
                  <span key={i} className="rounded bg-surface-2 px-2 py-0.5 text-[13px]">
                    {labelOf(item)}
                  </span>
                ))}
              </span>
            )}
          </Row>
          <Row label="Quantities">{lead.quantities ?? "—"}</Row>
          <Row label="Timeline">{lead.timeline ?? "—"}</Row>
          <Row label="Project details">
            <span className="whitespace-pre-wrap">{lead.projectDetails ?? "—"}</span>
          </Row>
          <Row label="Doorway">
            {isEmptyPrefillContext(lead.prefillContext) ? (
              "Direct (no doorway)"
            ) : (
              <span className="font-mono text-[12px]">
                {Object.entries(lead.prefillContext.resolved)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
                {lead.prefillContext.query ? ` · q="${lead.prefillContext.query}"` : ""}
                {lead.prefillContext.cleared ? " · cleared" : ""}
                {lead.prefillContext.edited ? " · edited" : ""}
              </span>
            )}
          </Row>
          <Row label="Consent">
            {lead.consent ? "Given" : "Not given"}
            {lead.consentAt ? ` · ${fmt(lead.consentAt)}` : ""}
            {lead.consentVersion ? ` · policy ${lead.consentVersion}` : ""}
          </Row>
          <Row label="Attachment">
            {att.state === "clean" ? (
              // Locale-prefix the frozen (locale-less) href so the proxy does not redirect.
              <a href={`/${locale}${att.href}`} className="underline">
                {att.name}
              </a>
            ) : att.state === "none" ? (
              "—"
            ) : att.state === "infected" ? (
              <span className="text-[#B42318]">Flagged by malware scan — not available</span>
            ) : att.state === "failed" ? (
              <span className="text-ink-2">{att.name} — file no longer available</span>
            ) : (
              <span className="text-ink-2">Scan in progress</span>
            )}
          </Row>
          <Row label="Team notified">{fmt(lead.notifiedAt)}</Row>
          <Row label="Sender confirmed">{fmt(lead.confirmationSentAt)}</Row>
          {failures.length > 0 && (
            <Row label="Delivery issues">
              <ul className="text-[#B42318]">
                {failures.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
      </div>
    </>
  );
}
