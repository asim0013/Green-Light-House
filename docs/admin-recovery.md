# Admin bootstrap & break-glass recovery (Story 4.1 — FR39a)

The site has a **single admin** and no role hierarchy. The login page cannot
create the first credential (it needs one to exist), and if the reset email
cannot be delivered there must still be a way back in. Both are the same script.

## 1. Create the first admin (bootstrap)

On a machine with the database reachable (`DATABASE_URL` set), from the repo root:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password-min-12' \
  npm run bootstrap:admin
```

- Refuses to create a second admin (single-admin invariant).
- Stores only the **argon2id hash** — the password reaches the process via env
  and only for the moment it is hashed; it is never printed or persisted raw.
- After running, **unset / rotate** `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## 2. Normal recovery (self-service, no developer)

The admin uses **Forgot your password?** on the login page. A single-use link
(valid 1 hour) is emailed via the configured transport (`EMAIL_PROVIDER`). The
raw token is never stored; using the link sets a new password and invalidates it.

## 3. Break-glass (email channel unavailable)

If the reset email cannot be delivered (mis-configured `EMAIL_PROVIDER`, lost
mailbox), reset the password directly on the server:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-new-long-password' \
  npm run bootstrap:admin -- --reset
```

- Works only for an admin that already exists; clears any pending reset token.
- Requires server/database access — the last-resort recovery path.

## Required config

- `AUTH_SECRET` — session JWT signing key, **≥32 bytes** or the app refuses to
  sign/verify. Rotate it and every session is invalidated (a blunt global logout).
