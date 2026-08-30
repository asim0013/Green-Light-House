-- Story 3.5 — the content-managed response process / SLA (FR30/FR34a/FR38).
--
-- Four additive tables: one singleton process row keyed `default`, its per-locale
-- text (kicker + summary), its ordered steps, and their per-locale text. No
-- destructive statement, nothing backfilled — the seed writes the rows.
--
-- ⚠️ THIS IS NOT THE `Setting` MODEL, AND THE EARLIER COMMENT STILL STANDS.
-- `20260825170000_epic3_lead_foundations`'s header says "Setting belongs to Story
-- 4.8 where the admin that edits it exists". That refers to a GENERIC key/value
-- settings bag — a different table 4.8 still owns and this migration does not
-- create. The SLA is structured, ordered, per-locale content, so it gets its own
-- models rather than being flattened into string values in a bag.
--
-- ⚠️ EN IS REQUIRED BY CONVENTION, NOT BY CONSTRAINT. The seed writes an EN row
-- in every environment and an integration test asserts it is present after
-- `db:seed`, but no database-level constraint enforces it: the read's degenerate
-- branch (`toSlaContent` returning null) must remain constructible, and a CHECK
-- that made the no-EN-row state impossible would make that branch untestable
-- against a real database.
--
-- `sort` on `sla_steps` is this schema's FIRST ordering column. Slug or id
-- ordering cannot express the 24h -> 3 days -> arrow sequence, and the ordering
-- is editorial rather than derivable. Story 3.1b's BOM lines inherit this choice.
--
-- Generated with `migrate dev --create-only` and applied with `migrate deploy`.
-- ⛔ `prisma migrate reset` / `db:reset` / `prisma db push` are consent-gated here
-- and were never run.

-- CreateTable
CREATE TABLE "sla_processes" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_process_translations" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "kicker" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "sla_process_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_steps" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_step_translations" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "badge" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "sla_step_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sla_processes_key_key" ON "sla_processes"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sla_process_translations_process_id_locale_key" ON "sla_process_translations"("process_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "sla_steps_process_id_sort_key" ON "sla_steps"("process_id", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "sla_step_translations_step_id_locale_key" ON "sla_step_translations"("step_id", "locale");

-- AddForeignKey
ALTER TABLE "sla_process_translations" ADD CONSTRAINT "sla_process_translations_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "sla_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_steps" ADD CONSTRAINT "sla_steps_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "sla_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_step_translations" ADD CONSTRAINT "sla_step_translations_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "sla_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
