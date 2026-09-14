/**
 * Bootstrap / break-glass for the single admin (Story 4.1 — FR39a, AC4).
 *
 * The login cannot mint the first credential (it needs one to exist), so this
 * script does. It is ALSO the break-glass path when a reset email cannot be
 * delivered: re-run with `--reset` to set a new password on the existing admin.
 *
 * Usage (from the repo root, DB reachable):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' \
 *     node --env-file=.env --import tsx scripts/bootstrap-admin.ts
 *   # break-glass (admin already exists):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD='new-long-password' \
 *     node --env-file=.env --import tsx scripts/bootstrap-admin.ts --reset
 *
 * ⚠️ It never prints the password and stores only the argon2id hash. The plain
 * password reaches this process via env only, and only for the moment it hashes.
 */
import {
  countAdmins,
  createAdmin,
  setPasswordByEmail,
} from "../src/server/repositories/admin-user";
import { hashSecret } from "../src/lib/auth/password";

const MIN_PASSWORD = 12;

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const reset = process.argv.includes("--reset");

  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.");
  }
  if (password.length < MIN_PASSWORD) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters.`);
  }

  const existing = await countAdmins();
  const hash = await hashSecret(password);

  if (reset) {
    const ok = await setPasswordByEmail(email, hash);
    if (!ok)
      throw new Error(`No admin with email ${email} to reset. Run without --reset to create one.`);
    console.log(`[bootstrap-admin] password reset for ${email}.`);
    return;
  }

  if (existing > 0) {
    throw new Error(
      `An admin already exists (${existing}). Refusing to create a second (single-admin). Use --reset to change the password.`,
    );
  }
  await createAdmin(email, hash);
  console.log(`[bootstrap-admin] created admin ${email}.`);
}

main()
  .catch((e) => {
    console.error("[bootstrap-admin]", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
