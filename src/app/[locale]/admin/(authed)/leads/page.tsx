import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import type { LeadStatus } from "@prisma/client";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminDataTable, editLinkClass } from "@/components/admin/catalog/AdminDataTable";
import { DeleteButton } from "@/components/admin/catalog/DeleteButton";
import { listLeadsForAdmin } from "@/server/repositories/lead";
import { deleteLeadAction } from "@/server/admin/leads/actions";

const STATUS_FILTERS: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  in_review: "In review",
  quoted: "Quoted",
  closed: "Closed",
};

function parseStatus(value: string | undefined): LeadStatus | undefined {
  const known = ["new", "in_review", "quoted", "closed"] as const;
  return value && (known as readonly string[]).includes(value) ? (value as LeadStatus) : undefined;
}

/** Inquiries / Leads list (Story 4.7) — inbound RFQs, newest-first, status-filtered. */
export default async function LeadsListPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const filter = parseStatus((await props.searchParams).status);
  const rows = await listLeadsForAdmin(filter);
  const exportHref = `/${locale}/admin/leads/export${filter ? `?status=${filter}` : ""}`;

  return (
    <>
      <AdminTopbar
        title="Inquiries"
        subtitle={`${rows.length} lead(s)${filter ? ` · ${STATUS_LABEL[filter]}` : ""}`}
        actions={
          // Plain <a> (not Link): this is a file download, not an SPA navigation.
          <a href={exportHref} className={editLinkClass}>
            Export CSV
          </a>
        }
      />
      <div className="flex flex-wrap gap-2 px-8 pt-6">
        {STATUS_FILTERS.map((f) => {
          const active = (f.value === "all" && !filter) || f.value === filter;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/admin/leads" : `/admin/leads?status=${f.value}`}
              className={`rounded px-3 py-1.5 font-mono text-[12px] ${
                active ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
      <div className="p-8">
        <AdminDataTable
          caption="Inbound RFQs"
          captionId="leads-caption"
          rows={rows}
          getRowKey={(r) => r.id}
          empty="No inquiries yet."
          columns={[
            { header: "Reference", rowHeader: true, cell: (r) => r.reference },
            { header: "Company", cell: (r) => r.company },
            { header: "Contact", cell: (r) => r.name },
            {
              header: "Status",
              cell: (r) => <span className="font-mono text-[12px]">{STATUS_LABEL[r.status]}</span>,
            },
            {
              header: "Source",
              cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.source}</span>,
            },
            {
              header: "Received",
              cell: (r) => (
                <span className="font-data text-[12px] text-ink-2">
                  {r.createdAt.toISOString().slice(0, 10)}
                </span>
              ),
            },
            {
              header: "File",
              align: "right",
              cell: (r) => (r.hasAttachment ? <span aria-label="has attachment">📎</span> : null),
            },
            {
              header: "Actions",
              align: "right",
              cell: (r) => (
                <span className="inline-flex items-center gap-3">
                  <Link href={`/admin/leads/${r.id}`} className={editLinkClass}>
                    View
                  </Link>
                  <DeleteButton action={deleteLeadAction} id={r.id} label={r.reference} />
                </span>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
