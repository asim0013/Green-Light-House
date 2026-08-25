-- Story 3.0 code review — correct the physical order of the `LeadSource` enum.
--
-- WHY THIS EXISTS AT ALL. Story 3.0's AC1 required `search` and `service` to be
-- "placed before `direct` so `direct` stays the fallthrough", and
-- `prisma/schema.prisma` declares them that way. The migration that added them
-- used bare `ALTER TYPE "LeadSource" ADD VALUE 'search'`, which APPENDS. The
-- clause that was needed is `ADD VALUE 'search' BEFORE 'direct'`. Measured on the
-- live database before this migration:
--
--   enumsortorder | enumlabel
--   --------------+-----------
--               1 | project
--               2 | product
--               3 | industry
--               4 | direct     <-- should be last
--               5 | search
--               6 | service
--
-- PRISMA IS BLIND TO THIS. `prisma migrate status` reported "Database schema is
-- up to date!" and a datasource-vs-datamodel diff emitted an EMPTY migration, so
-- every gate Story 3.0 ran was insensitive to a real divergence between
-- `schema.prisma` and the database. That is precisely the class of drift the
-- story's own Task 1 was written to prevent, which is why this is corrected
-- rather than documented away.
--
-- WHY A WHOLE NEW TYPE. PostgreSQL cannot reorder the values of an existing enum
-- — there is no `ALTER TYPE ... SET ORDER`. The only route is create-new,
-- swap-column, drop-old. That is cheap and safe RIGHT NOW because `leads` holds
-- 0 rows, so the `USING` cast below rewrites nothing; once the RFQ endpoint ships
-- in Story 3.2 this same correction would rewrite a table of live personal data.
-- This is the last moment it is free.
--
-- ORDER OF OPERATIONS IS LOAD-BEARING. The column default must be dropped first:
-- a default of `'direct'::"LeadSource"` binds to the OLD type, and Postgres
-- refuses to alter a column's type while a default referencing the outgoing type
-- is attached. It is re-attached at the end against the new type.

ALTER TABLE "leads" ALTER COLUMN "source" DROP DEFAULT;

ALTER TYPE "LeadSource" RENAME TO "LeadSource_old";

CREATE TYPE "LeadSource" AS ENUM ('project', 'product', 'industry', 'search', 'service', 'direct');

ALTER TABLE "leads"
  ALTER COLUMN "source" TYPE "LeadSource" USING ("source"::text::"LeadSource");

ALTER TABLE "leads" ALTER COLUMN "source" SET DEFAULT 'direct';

DROP TYPE "LeadSource_old";
