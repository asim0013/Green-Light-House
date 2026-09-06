-- Make the SLA step ordering constraint DEFERRABLE so steps can be reordered
-- in place (Story 3.5 review finding; done before Story 3.1b inherits the shape).
--
-- ⚠️ THE DEFECT, MEASURED RATHER THAN ASSUMED. `@@unique([processId, sort])`
-- compiles to a plain UNIQUE INDEX, which Postgres checks after EVERY statement.
-- Swapping two steps is inherently two UPDATEs, and every ordering of them passes
-- through a state where two rows share a `sort` — so the swap fails mid-transaction:
--
--     BEGIN;
--     UPDATE sla_steps SET sort=2 WHERE id='s1';
--     UPDATE sla_steps SET sort=1 WHERE id='s2';   -- ERROR: duplicate key value
--                                                  -- violates unique constraint
--
-- Verified on a throwaway database before writing this file, in both directions:
-- the swap above fails today, and succeeds once the constraint is deferrable and
-- the transaction defers it.
--
-- ⚠️ A UNIQUE INDEX CANNOT BE DEFERRED — ONLY A UNIQUE CONSTRAINT CAN. That is why
-- this drops the index and adds a constraint rather than altering anything: there
-- is no `ALTER INDEX ... DEFERRABLE`. Postgres creates a backing index of the same
-- name for the constraint, so the name, the columns and the uniqueness guarantee
-- are all preserved.
--
-- ⚠️ AND PRISMA SEES NO DRIFT. Checked before committing to this:
--   prisma migrate diff --from-url <db with this applied> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- returns "-- This is an empty migration." So `@@unique([processId, sort])` in
-- schema.prisma continues to describe this table correctly and `migrate dev` will
-- not try to undo it. **`schema.prisma` is deliberately NOT edited** — there is no
-- Prisma attribute for deferrability, and inventing one would create the drift
-- this check just proved absent.
--
-- INITIALLY IMMEDIATE, not INITIALLY DEFERRED: every existing write keeps its
-- current fail-fast behaviour, and a caller that genuinely needs a swap opts in
-- for the length of one transaction with
--     SET CONSTRAINTS sla_steps_process_id_sort_key DEFERRED;
-- Making it deferred by default would silently postpone every ordering error to
-- COMMIT, which is a worse diagnostic for the ninety-nine writes that are not swaps.
--
-- WHY NOW, with one process row and three steps in the table: Story 4.8 builds the
-- admin that reorders these, and Story 3.1b is expected to copy this `sort` shape
-- for project BOM lines. Fixing it here costs one additive migration; fixing it
-- after 3.1b copies it costs two tables and an admin UI already written against
-- the broken behaviour. `sort` is this schema's first ordering column, so whatever
-- it does becomes the precedent.
--
-- Additive and reversible: no data is read, written or lost.

-- ⚠️ `DROP INDEX`, NOT `DROP CONSTRAINT`, AND THE FIRST VERSION OF THIS FILE GOT
-- IT WRONG. Prisma's `@@unique` emits a BARE `CREATE UNIQUE INDEX` with no backing
-- constraint row, so `ALTER TABLE ... DROP CONSTRAINT` fails with
-- `constraint "…" of relation "sla_steps" does not exist`. Confirmed on the live
-- database: `pg_indexes` lists the index, `pg_constraint` has no matching row.
-- (The throwaway rehearsal hid this by running `DROP CONSTRAINT IF EXISTS` and
-- `DROP INDEX IF EXISTS` together — belt and braces that concealed which one was
-- load-bearing. Rehearse with the exact statement you intend to ship.)
DROP INDEX "sla_steps_process_id_sort_key";

ALTER TABLE "sla_steps"
  ADD CONSTRAINT "sla_steps_process_id_sort_key"
  UNIQUE ("process_id", "sort")
  DEFERRABLE INITIALLY IMMEDIATE;
