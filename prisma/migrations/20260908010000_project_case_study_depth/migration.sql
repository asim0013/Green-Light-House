-- Project case-study depth (Story 3.1b — FR21): facts columns, and the
-- scope-of-supply BOM that replaces the bare `project_products` join.
--
-- ⚠️ HAND-WRITTEN, NOT `migrate dev`-GENERATED, and the reason is recorded so the
-- next person does not waste the same half hour. `prisma migrate dev` refuses to
-- run non-interactively when it must drop a non-empty table ("You are about to
-- drop the `project_products` table, which is not empty (2 rows)"), and this
-- shell has no TTY to confirm on. The body below is `prisma migrate diff
-- --from-url <db> --to-schema-datamodel` output, reviewed and commented — the
-- same path `20260822153001_search_trgm` established for SQL Prisma will not
-- author itself.
--
-- ⚠️ AND A SECOND BLOCKER HAD TO BE CLEARED FIRST, which the Story 3.8 review
-- reported as clean and was not. `migrate resolve --rolled-back` leaves the
-- FAILED attempt's row in `_prisma_migrations` carrying the OLD file's checksum.
-- Prisma compares the file against EVERY row with that migration_name, so
-- `20260906120000_sla_steps_deferrable_sort` reported "was modified after it was
-- applied" and demanded a reset — on a file nobody had touched. `migrate status`
-- said "up to date"; only `migrate dev` is strict enough to see it. The residue
-- row (`finished_at IS NULL`, `rolled_back_at` set, `applied_steps_count = 0`,
-- log `ERROR: constraint "sla_steps_process_id_sort_key" ... does not exist`)
-- was deleted. It recorded an attempt that changed nothing; the successful row,
-- whose checksum matches the file exactly, is untouched.

-- ── The facts columns ───────────────────────────────────────────────────────
-- SCOPE and LOCATION are translated (place names differ per locale); LEAD TIME
-- is an integer rendered through an ICU plural, never prose — the canvas writes
-- it "six weeks" in one place and "6 wk" in another, and no locale can derive a
-- spelled-out numeral from an integer.
ALTER TABLE "project_translations" ADD COLUMN     "location" TEXT,
ADD COLUMN     "scope" TEXT;

ALTER TABLE "projects" ADD COLUMN     "lead_time_weeks" INTEGER;

-- ── `project_products` → `project_bom_lines` ────────────────────────────────
-- ⚠️ A DROP, NOT A RENAME, AND THE TWO ROWS ARE INTENTIONALLY LOST. Measured
-- before writing this: `project_products` held exactly 2 rows, both on
-- `lng-terminal-fire-gas-upgrade` (fd-9500, gd-410), and NO foreign key
-- referenced the table — so nothing depends on it and there is no referential
-- integrity to preserve. The rows carried only `(project_id, product_id)`: no
-- quantity, no ordering, no line label, none of which can be invented. The seed
-- re-creates them as full BOM lines with the canvas's quantities.
ALTER TABLE "project_products" DROP CONSTRAINT "project_products_product_id_fkey";
ALTER TABLE "project_products" DROP CONSTRAINT "project_products_project_id_fkey";
DROP TABLE "project_products";

CREATE TABLE "project_bom_lines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    -- ⚠️ NULLABLE ON PURPOSE. One designed row is not a catalog product at all —
    -- "Clean-agent suppression skid / FM-200 skid / — / 3" — and AC2 exists to
    -- prove that row renders. See the `model` note below.
    "product_id" TEXT,
    -- NOT NULL: the display value for EVERY line, stored even when a product is
    -- linked, so a line never depends on the join to render.
    "model" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_bom_lines_pkey" PRIMARY KEY ("id")
);

-- The CATEGORY column: authored editorial text per line, translated.
-- ⚠️ NOT the product's category name — counted, not assumed: ZERO of the
-- canvas's five CATEGORY cells match the seeded category of the product on that
-- row ("Triple-IR flame detection" vs "Flame detectors", and so on).
CREATE TABLE "project_bom_line_translations" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "project_bom_line_translations_pkey" PRIMARY KEY ("id")
);

-- ⚠️ NON-UNIQUE, DELIBERATELY. A compound UNIQUE on an ordering column is the
-- shape `sla_steps` had to be made DEFERRABLE for, and a deferrable unique
-- cannot serve as an `ON CONFLICT` arbiter (SQLSTATE 55000) — which breaks
-- `createMany({ skipDuplicates: true })` and every non-empty `upsert` on the
-- table. See the doc block on `model SlaStep`. The cost of a plain index is that
-- there is no addressable key for `upsert`, so the seed writes BOM lines
-- delete-then-create per project.
CREATE INDEX "project_bom_lines_project_id_sort_order_idx" ON "project_bom_lines"("project_id", "sort_order");

CREATE UNIQUE INDEX "project_bom_line_translations_line_id_locale_key" ON "project_bom_line_translations"("line_id", "locale");

ALTER TABLE "project_bom_lines" ADD CONSTRAINT "project_bom_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⛔ `SET NULL`, NOT `CASCADE` — and `project_products` carried `CASCADE`.
-- Cascade is right for a pure join row and WRONG here: with a nullable
-- `product_id`, cascading would let deleting a catalog product silently DELETE a
-- delivered project's BOM line, destroying the record and moving the footer's
-- derived line count and units total. Set-null degrades the line to its own
-- stored `model` with an em-dash manufacturer, which is exactly the non-catalog
-- rendering path the table already has.
ALTER TABLE "project_bom_lines" ADD CONSTRAINT "project_bom_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_bom_line_translations" ADD CONSTRAINT "project_bom_line_translations_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "project_bom_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
