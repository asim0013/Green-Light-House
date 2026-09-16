import type { ReactNode } from "react";

/** Shared admin link styles (server-safe constants). */
export const newLinkClass =
  "rounded bg-ink px-3 py-2 font-mono text-[12px] uppercase tracking-[0.08em] text-surface";
export const editLinkClass = "font-mono text-[12px] text-ink-2 underline";

/**
 * A reusable admin list table (Story 4.3) that inherits the accessibility
 * contract pinned by the site's first table (`ProjectBomTable`, Story 3.1b):
 * a named, keyboard-focusable `overflow-x-auto` region; a real semantic
 * `<table>` with an `sr-only` caption and `scope`-tagged headers; and NO flex
 * or grid utilities on any table element (that strips row/cell roles in
 * Chromium/Gecko). Row actions (Edit / Delete) are just an ordinary column.
 */

export interface AdminTableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Render this column's cell as the row header (`<th scope="row">`). */
  rowHeader?: boolean;
}

const headerClass =
  "border-b border-border-subtle px-5 py-3 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2";

export function AdminDataTable<T>({
  caption,
  captionId,
  columns,
  rows,
  getRowKey,
  empty,
}: {
  caption: string;
  captionId: string;
  columns: AdminTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="px-8 py-6 text-[14px] text-muted">{empty}</p>;
  }
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="mx-8 mb-8 overflow-x-auto border border-border-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr className="bg-surface-2">
            {columns.map((col, i) => (
              <th
                key={i}
                scope="col"
                className={col.align === "right" ? `${headerClass} text-right` : headerClass}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="bg-surface">
              {columns.map((col, i) =>
                col.rowHeader ? (
                  <th
                    key={i}
                    scope="row"
                    className="border-b border-border-subtle px-5 py-3.5 text-[14px] font-semibold text-ink"
                  >
                    {col.cell(row)}
                  </th>
                ) : (
                  <td
                    key={i}
                    className={`border-b border-border-subtle px-5 py-3.5 text-[13px] text-ink-2${
                      col.align === "right" ? " text-right" : ""
                    }`}
                  >
                    {col.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
