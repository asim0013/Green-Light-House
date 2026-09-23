import { Link } from "@/i18n/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

/** Content module home (Story 4.4) — the editorial/sector CRUD surfaces. */
const SECTIONS = [
  {
    href: "/admin/content/projects",
    label: "Projects",
    desc: "Case studies — title, story, facts, industry & status.",
  },
  {
    href: "/admin/content/services",
    label: "Services",
    desc: "The services offered, in three languages.",
  },
  {
    href: "/admin/content/industries",
    label: "Industries",
    desc: "The sectors that drive the IA and landing pages.",
  },
  {
    href: "/admin/content/homepage",
    label: "Homepage",
    desc: "The homepage hero, credibility copy and certification marks.",
  },
  {
    href: "/admin/content/team",
    label: "Team",
    desc: "Team members (public page arrives in Epic 5).",
  },
];

export default function ContentIndexPage() {
  return (
    <>
      <AdminTopbar title="Content" subtitle="Projects, services & industries" />
      <div className="grid gap-4 p-8 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col gap-1 rounded border border-border-subtle p-5 hover:border-ink"
          >
            <span className="font-heading text-[18px] font-bold text-ink">{s.label}</span>
            <span className="text-[13px] text-ink-2">{s.desc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
