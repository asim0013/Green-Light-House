-- Story 3.0 — Epic 3 foundations. Everything Epic 3's write path needs from the
-- schema, in ONE additive migration applied before any surface story starts.
--
-- PURELY ADDITIVE, AND THAT IS DELIBERATE. `leads` held 0 rows when this was
-- written (verified), which is the only reason `reference TEXT NOT NULL` is safe
-- without a backfill. The other Epic 3 schema changes — the ProjectProduct ->
-- ProjectBomLine replacement and the Setting model — are NOT here: the BOM change
-- is the only destructive statement in the whole Epic 3 set (DROP TABLE against 2
-- live rows) and belongs to Story 3.1b, and Setting belongs to Story 4.8 where the
-- admin that edits it exists.
--
-- HAND-EDITED, deliberately, in one place: the CREATE SEQUENCE below. Prisma
-- cannot author sequence objects, and `migrate dev` is interactive so it cannot
-- run in this environment at all — this file was generated with
-- `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --script`
-- against a throwaway shadow database, then the sequence was added by hand and the
-- whole thing applied with `migrate deploy`. `prisma migrate reset` is
-- consent-gated here and was never run.
--
-- The sequence MUST be created before the ALTER TABLE that references it: the
-- column default is validated at DDL time, so a generated-but-unedited version of
-- this file fails on its own first ALTER.

-- START 2000 is deliberate: a reference beginning at 1 would tell every recipient
-- exactly how many inquiries GLH has ever received.
CREATE SEQUENCE "lead_reference_seq" START 2000;

-- CreateEnum
CREATE TYPE "AttachmentScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');

-- AlterEnum
-- Two values added in one migration. PostgreSQL 11 and earlier could not do this
-- in a single migration; this project runs PostgreSQL 17. Adding a value inside a
-- transaction is allowed — USING it in the same transaction is not, and nothing
-- here does.
ALTER TYPE "LeadSource" ADD VALUE 'search';
ALTER TYPE "LeadSource" ADD VALUE 'service';

-- AlterTable
--
-- NOTE ON `reference`: NO lpad. The epics AC proposed
-- `lpad((nextval(...))::text, 4, '0')`, which is wrong — Postgres `lpad`
-- TRUNCATES to the target width as well as padding. Proven in a scratch database:
-- sequence 9999 -> GLH-RFQ-9999, 10000 -> GLH-RFQ-1000, and 10001/10002 both died
-- with `duplicate key value violates unique constraint ... (GLH-RFQ-1000) already
-- exists`. On a live RFQ endpoint that is a hard failure on the 10,001st inquiry.
-- Without lpad the reference is four digits until it naturally becomes five.
--
-- The default expression below is POSTGRES'S OWN CANONICAL FORM, read back with
-- `pg_get_expr`. Prisma 6 compares `dbgenerated` strings literally, so a
-- semantically identical but differently-spelled expression makes every later
-- `migrate dev` propose a spurious `ALTER COLUMN ... SET DEFAULT` — and the remedy
-- for that drift is a reset, which is forbidden here. Do not "tidy" it.
ALTER TABLE "leads" ADD COLUMN     "attachment_mime" TEXT,
ADD COLUMN     "attachment_name" TEXT,
ADD COLUMN     "attachment_scan_status" "AttachmentScanStatus",
ADD COLUMN     "attachment_scanned_at" TIMESTAMP(3),
ADD COLUMN     "attachment_size_bytes" INTEGER,
ADD COLUMN     "confirmation_sent_at" TIMESTAMP(3),
ADD COLUMN     "consent_version" TEXT,
ADD COLUMN     "delivery_failure_reason" TEXT,
ADD COLUMN     "notified_at" TIMESTAMP(3),
ADD COLUMN     "reference" TEXT NOT NULL DEFAULT ('GLH-RFQ-'::text || (nextval('lead_reference_seq'::regclass))::text),
ADD COLUMN     "timeline" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "leads_reference_key" ON "leads"("reference");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");
