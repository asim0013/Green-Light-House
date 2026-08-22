-- Story 2.5 — model-number search (FR17/FR17a/FR19; architecture:85 "Search v1:
-- PostgreSQL full-text + pg_trgm").
--
-- HAND-EDITED, deliberately. Expression indexes cannot be modeled in
-- schema.prisma, so this migration was created with `migrate dev --create-only`
-- and written by hand. Prisma's differ cannot see these objects, which means it
-- will NEVER try to drop or recreate them — hand-added SQL outside the schema
-- model is invisible to diffing (verified: a subsequent `migrate dev` proposes
-- no changes).
--
-- THE NORMALIZED EXPRESSION IS THE POINT. Buyers paste model variants —
-- `fd9500`, `FD 9500`, `fd-9500` — and a plain trigram index on `model` cannot
-- serve a hyphen-stripped query. Both sides of the match strip to [a-z0-9]:
-- the index below covers `regexp_replace(lower(model), '[^a-z0-9]', '', 'g')`
-- and the query normalizes its input the same way. The expression MUST stay
-- byte-identical to the one in `searchProducts` (product.ts) or the planner
-- falls back to a sequential scan — cheap at seed scale, wrong at 50k (NFR).
--
-- Name matching uses a plain trigram index on the translated names (substring
-- ILIKE '%q%' is what GIN trgm accelerates). Full tsvector FTS is deliberately
-- NOT here: it buys stemming for prose the catalog does not have, and the
-- architecture defers dedicated search engines outright (architecture:80).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Model matching: normalized expression index.
CREATE INDEX "products_model_trgm_idx" ON "products"
  USING gin (regexp_replace(lower("model"), '[^a-z0-9]', '', 'g') gin_trgm_ops);

-- Name matching: translated names, as stored (FR19 — the query constrains
-- locale to {active, en} per the fallback contract).
CREATE INDEX "product_translations_name_trgm_idx" ON "product_translations"
  USING gin (lower("name") gin_trgm_ops);
