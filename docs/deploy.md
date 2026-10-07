# Production deployment — www.greenlighthouse.net

One Linux server runs everything with Docker Compose (`docker-compose.prod.yml`):
Caddy (HTTPS) → the Next.js app, plus the email worker, PostgreSQL, two Redis
instances, MinIO (file storage), ClamAV (upload scanning) and a nightly backup to a
Hetzner Storage Box. Only Caddy is reachable from the internet.

> Every command below runs **on the server** unless it says otherwise. Secrets are
> generated there and never pasted into chat, tickets or git.

---

## 1. What you need first

| Item | Notes |
|---|---|
| **Server** | Hetzner Cloud, EU location, ~4 vCPU / 8 GB RAM (ClamAV alone uses ~1.5–2 GB), 80 GB+ disk, **Ubuntu 24.04**. Add your SSH key when creating it. |
| **DNS** | At the registrar for `greenlighthouse.net`: `A` record for **`www`** and for **`@`** (the bare domain) → the server's IPv4. Optional `AAAA` records → its IPv6. |
| **Email sending** | A [Resend](https://resend.com) account with `greenlighthouse.net` added and **verified** (add the SPF/DKIM TXT records Resend shows). Add a DMARC record too, e.g. `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<you>`. |
| **Inbox** | A mailbox that receives RFQ notifications, e.g. `sales@greenlighthouse.net` (Google Workspace, Zoho, …). Its MX records must exist. |
| **Backups** | A Hetzner **Storage Box** (BX11 is plenty). In its settings enable **SSH support**. Note its username/host (`uXXXXXX` / `uXXXXXX.your-storagebox.de`). |

Check DNS has propagated before step 5 (Let's Encrypt needs it):

```bash
dig +short www.greenlighthouse.net
```

```bash
dig +short greenlighthouse.net
```

Both must print the server's IP.

## 2. Prepare the server (once)

```bash
apt update && apt -y upgrade && apt -y install ca-certificates curl git ufw unattended-upgrades
```

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

## 3. Get the code

The repository is private: add a **read-only deploy key** for the server in GitHub
(repo → Settings → Deploy keys), then:

```bash
git clone git@github.com:asim0013/Green-Light-House.git /opt/glh && cd /opt/glh
```

## 4. Configure

```bash
cp .env.production.example .env.production && chmod 600 .env.production
```

Generate one value per secret (`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
`AUTH_SECRET`, `REVALIDATE_SECRET`, `RESTIC_PASSWORD`) — run it once for each:

```bash
openssl rand -hex 32
```

Then edit `.env.production` and fill in **every empty value** (the file explains each
one): `ACME_EMAIL`, the secrets, `EMAIL_API_KEY`, `EMAIL_FROM`, `RFQ_NOTIFY_TO`,
`RESTIC_REPOSITORY`. Keep `SITE_ALLOW_INDEXING=false` for now. **Save
`RESTIC_PASSWORD` in your password manager** — without it the backups cannot be read.

### Backup SSH key (Storage Box)

```bash
ssh-keygen -t ed25519 -N "" -C glh-backup -f deploy/backup/ssh/id_ed25519
```

```bash
cat deploy/backup/ssh/id_ed25519.pub | ssh -p 23 uXXXXXX@uXXXXXX.your-storagebox.de install-ssh-key
```

```bash
ssh-keyscan -p 23 uXXXXXX.your-storagebox.de > deploy/backup/ssh/known_hosts
```

Create `deploy/backup/ssh/config` (replace `uXXXXXX` twice):

```
Host storagebox
  HostName uXXXXXX.your-storagebox.de
  User uXXXXXX
  Port 23
  IdentityFile /root/.ssh/id_ed25519
```

and set `RESTIC_REPOSITORY=sftp:storagebox:glh-restic` in `.env.production`.

## 5. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The first start takes several minutes (image builds; ClamAV loads its signatures).
Watch it come up — every service should reach `running (healthy)`, and `init` should
show `exited (0)`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps -a
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f caddy app init
```

`init` runs the database migrations and creates the storage bucket on every deploy.
It does **not** load demo content.

## 6. Verify

```bash
curl -s https://www.greenlighthouse.net/api/health
```

→ `{"status":"ok","checks":{"database":"ok","leads":"ok"}}`

```bash
curl -sI http://greenlighthouse.net/ | grep -i location
```

→ redirects end at `https://www.greenlighthouse.net/`.

## 7. First admin account

Typing the password into a variable keeps it out of your shell history:

```bash
read -r ADMIN_EMAIL && read -rs ADMIN_PASSWORD && export ADMIN_EMAIL ADMIN_PASSWORD
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD init node --import tsx scripts/bootstrap-admin.ts
```

```bash
unset ADMIN_PASSWORD
```

Sign in at `https://www.greenlighthouse.net/en/admin/login`. A lost password:
`docs/admin-recovery.md` (same command with `--reset`).

## 8. Content

In **Admin → Settings**: the real phone (E.164 + display form), contact email,
address and the RFQ notification address. Then the catalog — products, industries,
projects, services, documents, media — through the admin screens or **Admin →
Settings → Import**.

> The development seed (`npx prisma db seed`) is demo data (e.g. products AS-60,
> FD-9500). Do not run it in production unless that catalog is confirmed real.

## 9. End-to-end check

Submit a real inquiry at `/en/rfq` (with a small PDF attached). Within a minute:
the notification arrives at `RFQ_NOTIFY_TO`, the confirmation arrives at the address
you entered, and the lead appears in **Admin → Leads**. If no email arrives:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 100 worker
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec worker node --import tsx scripts/queue-ops.ts failed
```

## 10. Backups

The `backup` service runs once at start and then nightly (`BACKUP_SCHEDULE`, UTC):
it dumps PostgreSQL (and a separate leads database, if configured), mirrors the
MinIO bucket, and stores an encrypted, deduplicated snapshot on the Storage Box
(kept: 14 daily, 8 weekly, 12 monthly). Its container turns **unhealthy** if the last
successful run is older than 26 hours.

List snapshots:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backup restic snapshots
```

**Restore drill** (do it once now, then quarterly) — restores into a THROWAWAY
database, prints row counts, touches nothing live:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backup restore.sh latest glh_restore_drill
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec postgres dropdb -U glh glh_restore_drill
```

Restoring over the live site is deliberate: stop `app` and `worker`, restore with
`pg_restore --clean` into `greenlighthouse`, mirror the objects back with `mcli`,
start them again. If a leads store is split (`docs/data-residency.md`), restore its
`lead_reference_seq` value exactly.

## 11. Updates

```bash
cd /opt/glh && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`init` applies any new migrations before the new app starts. To roll back, check out
the previous commit and run the same command (migrations are forward-only — a release
with a migration needs a database restore to fully roll back).

## 12. Monitoring

Point an external uptime monitor (UptimeRobot, Better Stack, …) at
`https://www.greenlighthouse.net/api/health` — it answers 503 when the database or
leads store is down. Error tracking and log shipping are Story 5.6.

## 13. Going public (indexing)

Only after the GO-LIVE checklist (`owner-actions.md` §0 — real contact data, legal and
translation reviews, approval flags):

1. Set `SITE_ALLOW_INDEXING=true` in `.env.production`.
2. Restart the app (read at runtime — no rebuild):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d app
   ```

3. Submit `https://www.greenlighthouse.net/sitemap.xml` in **Google Search Console**
   and **Yandex Webmaster**.

## Troubleshooting

| Symptom | Check |
|---|---|
| Browser shows a certificate error | DNS not pointing here yet, or ports 80/443 blocked — `logs caddy` shows the ACME error. |
| `app` never becomes healthy | `logs app` — usually a missing/invalid `.env.production` value (`AUTH_SECRET`, `SITE_DOMAIN`). |
| `worker` keeps restarting | `EMAIL_PROVIDER` must be `resend` with `EMAIL_API_KEY` set — production refuses a non-delivering transport. |
| RFQ form says "forbidden" | `SITE_DOMAIN` must be exactly the host in the browser's address bar (`www.…`). |
| Uploads rejected as unscannable | ClamAV still starting (up to ~6 min after boot) — `ps` shows `clamav` health. |
