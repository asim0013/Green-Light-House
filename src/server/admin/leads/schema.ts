import { z } from "zod";
import { idField } from "@/server/admin/catalog/schema";

/**
 * Admin leads schema (Story 4.7). Only the status update is a zod-parseable
 * mutation (delete takes just an id via `idSchema`; export + attachment are GET
 * routes). Status mirrors the `LeadStatus` enum (new/in_review/quoted/closed).
 */
export const leadStatusSchema = z.object({
  id: idField,
  status: z.enum(["new", "in_review", "quoted", "closed"]),
});
export type LeadStatusInput = z.infer<typeof leadStatusSchema>;
