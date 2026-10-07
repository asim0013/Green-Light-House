# Production deployment — www.greenlighthouse.net

One Linux server runs the site with Docker Compose (`docker-compose.prod.yml`):
Caddy (HTTPS) → the Next.js app, plus the email worker, PostgreSQL, two Redis
instances, ClamAV (upload scanning) and a nightly backup to a Hetzner Storage Box.
Uploaded files (datasheets, RFQ attachments, images) live in **Hetzner Object
Storage**. Only Caddy is reachable from the internet.

> Every command below runs **on the server**, in `/opt/glh`, unless it says
> otherwise. Secrets are generated there and never pasted into chat, tickets or git.
>
> On the server the settings file is named **`.env`** and it selects the production
> compose file, so every command is a plain `docker compose …`.

---

## 1. What you need first

| Item | Notes |
|---|---|
| **Server** | Hetzner Cloud, EU location (e.g. Falkenstein), ~4 vCPU / 8 GB RAM (ClamAV alone uses ~1.5–2 GB), 80 GB+ disk, **Ubuntu 24.04**. Add your SSH key when creating it. Use a Hetzner Cloud **project of its own** for GLH (the Object Storage keys below are per project). |
| **Firewall** | In the Hetzner Console create a **Firewall** for the server: inbound TCP 22, 80, 443 and UDP 443 only. |
| **DNS** | At the registrar for `greenlighthouse.net`: `A` record for **`www`** and for **`@`** (the bare domain) → the server's IPv4. **Do not add `AAAA` (IPv6) records**: with Docker's default IPv4-only network every IPv6 visitor would reach the app from the same internal address and share one RFQ rate-limit bucket. |
| **File storage** | Hetzner Console → **Object Storage** → create a bucket in the **same location as the server** (e.g. `fsn1`), visibility **Private**, a unique name such as `greenlighthouse-media`. Then **Security → S3 credentials → Generate**: copy the access key and secret key straight into `.env` in step 4 (the secret is shown only once). |
| **Email sending** | A [Resend](https://resend.com) account with `greenlighthouse.net` added and **verified** (add the SPF/DKIM TXT records Resend shows). Add a DMARC record too, e.g. `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<you>`. |
| **Inbox** | A mailbox that receives RFQ notifications, e.g. `sales@greenlighthouse.net` (Google Workspace, Zoho, …). Its MX records must exist. |
| **Backups** | A Hetzner **Storage Box** (BX11 is plenty). In its settings enable **SSH support** and **automatic snapshots** (daily, keep 7+). Note its username/host (`uXXXXXX` / `uXXXXXX.your-storagebox.de`). The Storage Box's own snapshots are outside the server's reach, so a compromised server cannot delete them. |
| **Backup alert** | A free [healthchecks.io](https://healthchecks.io) check (period 1 day, grace 2 hours) that emails you. You will paste its ping URL into `BACKUP_HEARTBEAT_URL`. |

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
export DEBIAN_FRONTEND=noninteractive && apt update && apt -y upgrade && apt -y install ca-certificates curl git ufw unattended-upgrades
```

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

SSH: keys only, no passwords (make sure your own key login works first):

```bash
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-glh.conf && systemctl reload ssh
```

Reboot once so the upgraded kernel is running:

```bash
reboot
```

> Docker publishes ports **past** ufw. That is safe here only because Caddy is the
> one service with published ports; never run the development `docker-compose.yml`
> on this server (the `.env` from step 4 makes a bare `docker compose` use the
> production file).

## 3. Get the code

The repository is private. Create a key for the server:

```bash
ssh-keygen -t ed25519 -N "" -C glh-server -f ~/.ssh/id_ed25519
```

```bash
cat ~/.ssh/id_ed25519.pub
```

Add that line in GitHub: repository → **Settings → Deploy keys → Add deploy key**
(leave *Allow write access* **off**). Then trust GitHub's host key — compare the
printed fingerprint with the ED25519 one GitHub publishes at
`https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints`:

```bash
ssh-keyscan -t ed25519 github.com > /tmp/gh && ssh-keygen -lf /tmp/gh && cat /tmp/gh >> ~/.ssh/known_hosts
```

```bash
git clone git@github.com:asim0013/Green-Light-House.git /opt/glh && cd /opt/glh
```

## 4. Configure

```bash
cp .env.production.example .env && chmod 600 .env
```

Generate one value per secret (`POSTGRES_PASSWORD`, `AUTH_SECRET`,
`REVALIDATE_SECRET`, `RESTIC_PASSWORD`) — run it once for each:

```bash
openssl rand -hex 32
```

Then edit `.env` and fill in **every empty value** (the file explains each one):
`ACME_EMAIL`, the secrets, the `S3_*` values from step 1, `EMAIL_API_KEY`,
`EMAIL_FROM`, `RFQ_NOTIFY_TO`, `RESTIC_REPOSITORY`, `BACKUP_HEARTBEAT_URL`. Keep
`SITE_ALLOW_INDEXING=false` for now. A forgotten required value makes step 5 stop
with its name.

**Save a copy of the finished `.env` in your password manager.** Without it — above
all `RESTIC_PASSWORD` — the backups cannot be read and a dead server cannot be rebuilt.

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

and set `RESTIC_REPOSITORY=sftp:storagebox:glh-restic` in `.env`. The key is mounted
into the backup container at run time only; it is excluded from every image build
(`.dockerignore`).

## 5. Start

```bash
docker compose up -d --build
```

The first start takes several minutes (image builds; ClamAV loads its signatures).
Watch it come up — every service should reach `running (healthy)`, and `init` should
show `exited (0)`:

```bash
docker compose ps -a
```

```bash
docker compose logs -f caddy app init
```

`init` runs on every deploy: database migrations, a check that the storage bucket is
reachable, and — only if none exists yet — the default **response process (SLA)**
("Technical review in 24 h · specced proposal in 3 working days"). It never
overwrites an SLA edited in Admin → Settings, and it does **not** load demo content.

## 6. Verify

```bash
curl -s https://www.greenlighthouse.net/api/health
```

→ `{"status":"ok","checks":{"database":"ok","leads":"ok"}}`

```bash
curl -sIL http://greenlighthouse.net/ | grep -i '^location'
```

→ two redirects, the last one to `https://www.greenlighthouse.net/`.

## 7. First admin account

Typing the password into a variable keeps it out of your shell history:

```bash
read -r ADMIN_EMAIL && read -rs ADMIN_PASSWORD && export ADMIN_EMAIL ADMIN_PASSWORD
```

```bash
docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD init node --import tsx scripts/bootstrap-admin.ts
```

```bash
unset ADMIN_PASSWORD
```

Sign in at `https://www.greenlighthouse.net/en/admin/login`. A lost password:
`docs/admin-recovery.md` (same command with `--reset`).

## 8. Content

Do this **right after** the first login — until then the public header shows the
placeholder phone number.

1. **Admin → Settings**: the real phone (E.164 + display form), contact email,
   address and the RFQ notification address. Check the response process (SLA) at
   the bottom of the same page.
2. **Admin → Content → Homepage**: the certification marks. **None are shown until
   you enter them** — only list certifications the company actually holds.
3. The catalog — products, industries, projects, services, documents, media —
   through the admin screens or **Admin → Settings → Import**.

> The development seed (`npx prisma db seed`) is demo data (e.g. products AS-60,
> FD-9500). Never run it in production.

## 9. End-to-end check

Submit a real inquiry at `/en/rfq` (with a small PDF attached). Within a minute:
the notification arrives at `RFQ_NOTIFY_TO`, the confirmation arrives at the address
you entered, and the lead appears in **Admin → Leads**. If no email arrives:

```bash
docker compose logs --tail 100 worker
```

```bash
docker compose exec worker node --import tsx scripts/queue-ops.ts failed
```

## 10. Backups

The `backup` service runs once at start and then nightly (`BACKUP_SCHEDULE`, UTC):
it dumps PostgreSQL (and a separate leads database, if configured), copies the
Object Storage bucket, and stores an encrypted, deduplicated snapshot on the Storage
Box (kept: the newest 7, then 14 daily, 8 weekly, 12 monthly). Every run pings `BACKUP_HEARTBEAT_URL`
(success) or `…/fail`; healthchecks.io emails you when the pings stop or fail.

A run **refuses** when the bucket suddenly holds less than half the objects of the
previous backup (an emptied or misconfigured bucket would otherwise replace that
day's good snapshot). If the drop is intended (you deleted a lot of media):

```bash
docker compose exec -e BACKUP_ALLOW_SHRINK=yes backup backup.sh
```

List snapshots:

```bash
docker compose exec backup restic snapshots
```

### Restore drill (once now, then quarterly)

Restores into a **new** database, prints row counts, touches nothing live:

```bash
docker compose exec backup restore.sh latest glh_restore_drill
```

```bash
docker compose exec postgres dropdb -U glh glh_restore_drill
```

```bash
docker compose exec backup rm -rf /restore
```

`restore.sh` refuses a database that already exists and the live database and bucket
names. To also drill the files, create an empty private bucket (e.g.
`greenlighthouse-media-drill`) in the Hetzner Console, add it as a third argument —
`restore.sh latest glh_restore_drill greenlighthouse-media-drill` — check a file in
the Console, then delete that bucket.

### Disaster recovery (live data lost or corrupted)

**Do not use `latest`.** A backup that ran after the problem started (nightly, or
when the container restarted) has captured the broken state. List the snapshots and
pick the last one from **before** the incident (the newest 7 are always kept, plus
one per day / week / month):

```bash
docker compose exec backup restic snapshots
```

```bash
docker compose stop app worker
```

```bash
docker compose exec postgres dropdb -U glh greenlighthouse
```

```bash
docker compose exec -e RESTORE_OVER_LIVE=yes backup restore.sh <snapshot-id> greenlighthouse <your-bucket-name>
```

```bash
docker compose up -d
```

```bash
docker compose exec backup rm -rf /restore
```

Objects are copied back without deleting anything newer in the bucket. (Rehearsed
end to end before launch: lead, attachment and the reference sequence all came back,
and the next inquiry continued the numbering.) A split leads
store (`docs/data-residency.md`) is restored as `greenlighthouse_leads` on this server;
move it to its regional server with `pg_dump`/`pg_restore` and keep
`lead_reference_seq` exactly as restored.

**Server gone entirely:** create a new server (steps 1–3), restore `.env` and the
Storage Box key from your password manager into `/opt/glh/.env` and
`deploy/backup/ssh/`, set `BACKUP_ON_START=false` in `.env` (so the empty new
server is not snapshotted first), run `docker compose up -d --build`, then the
disaster recovery commands above, then set `BACKUP_ON_START=true` again.

## 11. Updates

```bash
cd /opt/glh && git pull && docker compose up -d --build
```

`init` applies any new migrations **while the previous app version is still
serving** and before the new one starts, so every migration must stay compatible
with the code before it (add columns/tables; remove only in a later release). To
roll back, check out the previous commit and run the same command (migrations are
forward-only — a release with a migration needs a database restore to fully roll
back).

## 12. Monitoring

- **Site:** an external uptime monitor (UptimeRobot, Better Stack, …) on
  `https://www.greenlighthouse.net/api/health` — it answers 503 when the database or
  leads store is down.
- **Backups:** the healthchecks.io check from step 1.
- **Containers:** `docker compose ps` — `backup` turns **unhealthy** after 26 hours
  without a successful run.

Container logs are rotated (5 × 10 MB per service). Error tracking and log shipping
are Story 5.6.

## 13. Going public (indexing)

Only after the GO-LIVE checklist (`owner-actions.md` §0 — real contact data, legal and
translation reviews, approval flags):

1. Set `SITE_ALLOW_INDEXING=true` in `.env`.
2. Restart the app (read at runtime — no rebuild):

   ```bash
   docker compose up -d app
   ```

3. Submit `https://www.greenlighthouse.net/sitemap.xml` in **Google Search Console**
   and **Yandex Webmaster**.

Pages without real content stay `noindex` even then — the homepage, for one, needs
catalog entries first. That is deliberate (thin pages are kept out of search).

## Known limits

- The app connects to PostgreSQL as the database owner (`glh`). A separate
  least-privilege role for the app is a planned hardening step.
- Hetzner Object Storage credentials apply to every bucket in the Hetzner project —
  which is why GLH gets a project of its own (step 1).

## Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` stops with "required variable … is missing a value" | Fill that value in `.env`. |
| Browser shows a certificate error | DNS not pointing here yet, or ports 80/443 blocked — `docker compose logs caddy` shows the ACME error. |
| `init` exits 1 with "Cannot reach bucket (HTTP 403)" | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` wrong, or `S3_ENDPOINT` / `S3_REGION` not the bucket's location. |
| `app` never becomes healthy | `docker compose logs app` — usually an invalid `.env` value (`AUTH_SECRET` shorter than 32 bytes, `SITE_DOMAIN`). The site still answers 502 meanwhile. |
| `worker` keeps restarting | `EMAIL_PROVIDER` must be `resend` with `EMAIL_API_KEY` set — production refuses a non-delivering transport. |
| RFQ form says "forbidden" | `SITE_DOMAIN` must be exactly the host in the browser's address bar (`www.…`). |
| Uploads rejected as unscannable | ClamAV still starting (up to ~6 min after boot) — `docker compose ps` shows `clamav` health. Inquiries without a file are unaffected. |
| Changed `POSTGRES_PASSWORD` and now nothing connects | The password is set only when the database is first created. Put the old value back, or change it in the database first: `docker compose exec postgres psql -U glh -d greenlighthouse -c "ALTER USER glh PASSWORD '<new>'"`, then update `.env` and `docker compose up -d`. |
| Backup log says "REFUSING: the bucket holds …" | See §10 — confirm the drop is intended, then run once with `BACKUP_ALLOW_SHRINK=yes`. |
