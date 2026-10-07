# Production deployment — www.greenlighthouse.net

One Linux server runs the whole site with Docker Compose (`docker-compose.prod.yml`):
Caddy (HTTPS) → the Next.js app, plus the email worker, PostgreSQL, two Redis
instances, ClamAV (upload scanning), the file store for uploads (SeaweedFS, S3 API)
and a nightly encrypted backup to **Backblaze B2**. Only Caddy is reachable from the
internet.

The launch server is an **Oracle Cloud Always Free** Ampere A1 VM (arm64): free as
long as usage stays inside Oracle's Always Free limits. The same files also run on
a paid x86 VM (e.g. Hetzner) — differences are noted where they matter.

> Every command below runs **on the server**, as root, in `/opt/glh`, unless it says
> otherwise. Secrets are generated there and never pasted into chat, tickets or git.
>
> On the server the settings file is named **`.env`** and it selects the production
> compose file, so every command is a plain `docker compose …`.

---

## 1. What you need first

| Item | Notes |
|---|---|
| **Oracle Cloud account** | Sign up at `https://signup.cloud.oracle.com`. Choose an **EU home region** — preferably **Germany Central (Frankfurt)**; it **cannot be changed later**. A card is required for identity verification (Always Free resources are not charged). |
| **Upgrade to Pay As You Go** | Strongly recommended, still **€0** while you stay inside Always Free: Oracle *reclaims* idle Always Free VMs on free-only accounts, and free-only accounts often get "out of capacity" for Ampere A1. Billing → *Upgrade and manage payment*. Then set a **budget alert** of €1 (Billing → Budgets) so any accidental paid resource emails you. |
| **Server** | Compute → Instances → *Create instance*: image **Canonical Ubuntu 24.04** (aarch64), shape **Ampere → VM.Standard.A1.Flex, 2 OCPU / 12 GB** (the current Always Free maximum), **boot volume 100 GB** (Always Free covers 200 GB in total), *Assign a public IPv4 address* on, and paste **your SSH public key**. "Out of capacity" → try another availability domain, or again later. Note the instance's **Public IP address** (instance page → *Instance access*). |
| **Firewall (Oracle)** | Instance page → subnet → **Security List** → *Add Ingress Rules*: source `0.0.0.0/0`, TCP, destination ports **80,443**; and a second rule UDP **443**. (SSH 22 is already open.) The server's own firewall is opened in step 2. |
| **DNS** | At the registrar for `greenlighthouse.net`: `A` record for **`www`** and for **`@`** (the bare domain) → the server's public IPv4. **Do not add `AAAA` (IPv6) records**: with Docker's default IPv4-only network every IPv6 visitor would reach the app from the same internal address and share one RFQ rate-limit bucket. |
| **Backups (Backblaze B2)** | Sign up at `https://www.backblaze.com/sign-up/cloud-storage` and choose the **EU Central** region (it cannot be changed later). Buckets → *Create a Bucket*: **Private**, encryption on, a unique name such as `glh-backups-<something>`. Its *Lifecycle Settings* → **Keep prior versions for this number of days: 7** (deleted backup files stay recoverable for a week). Note the bucket's **Endpoint** (e.g. `s3.eu-central-003.backblazeb2.com`). Application Keys → *Add a New Application Key*: access **only that bucket**, Read and Write → copy **keyID** and **applicationKey** straight into `.env` in step 4 (the key is shown once). The first 10 GB are free. |
| **Email sending** | A [Resend](https://resend.com) account (free tier: 3,000 emails/month) with `greenlighthouse.net` added and **verified** (add the SPF/DKIM TXT records Resend shows). Add a DMARC record too, e.g. `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<you>`. |
| **Inbox** | A mailbox that receives RFQ notifications, e.g. `sales@greenlighthouse.net`. Its MX records must exist. |
| **Backup alert** | A free [healthchecks.io](https://healthchecks.io) check (period 1 day, grace 2 hours) that emails you. You will paste its ping URL into `BACKUP_HEARTBEAT_URL`. |

Check DNS has propagated before step 5 (Let's Encrypt needs it):

```bash
nslookup www.greenlighthouse.net
```

```bash
nslookup greenlighthouse.net
```

Both must print the server's IP.

## 2. Prepare the server (once)

From your own computer (Oracle's Ubuntu user is `ubuntu`, not `root`):

```bash
ssh ubuntu@<server-IP>
```

Then become root for everything that follows:

```bash
sudo -i
```

```bash
export DEBIAN_FRONTEND=noninteractive && apt update && apt -y upgrade && apt -y install ca-certificates curl git unattended-upgrades iptables-persistent
```

```bash
curl -fsSL https://get.docker.com | sh
```

Open HTTP/HTTPS in the server's own firewall. Oracle's Ubuntu image ships strict
`iptables` rules ending in a REJECT, so the new rules go **first** (`-I`), then are
saved for reboots. Do **not** install or enable `ufw` on Oracle — it fights these
rules and can lock you out.

```bash
iptables -I INPUT -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j ACCEPT && iptables -I INPUT -p udp --dport 443 -j ACCEPT && netfilter-persistent save
```

SSH: keys only, no passwords (make sure your own key login works first):

```bash
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-glh.conf && systemctl reload ssh
```

Reboot once so the upgraded kernel is running, then reconnect and `sudo -i` again:

```bash
reboot
```

> Docker publishes ports **past** the host firewall. That is safe here only because
> Caddy is the one service with published ports; never run the development
> `docker-compose.yml` on this server (the `.env` from step 4 makes a bare
> `docker compose` use the production file).
>
> *On a paid x86 VM (e.g. Hetzner) instead:* use its cloud firewall for 22/80/443
> and `ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable`
> in place of the `iptables` line.

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

Generate the secrets — `openssl rand -hex 32` once each for `POSTGRES_PASSWORD`,
`AUTH_SECRET`, `REVALIDATE_SECRET`, `RESTIC_PASSWORD` and `S3_SECRET_ACCESS_KEY`,
and `openssl rand -hex 16` for `S3_ACCESS_KEY_ID`:

```bash
openssl rand -hex 32
```

Then edit `.env` (e.g. `nano .env`) and fill in **every empty value** (the file
explains each one): `ACME_EMAIL`, the secrets, `EMAIL_API_KEY`, `EMAIL_FROM`,
`RFQ_NOTIFY_TO`, and for the backups `RESTIC_REPOSITORY`
(`s3:https://<B2 endpoint>/<B2 bucket>`), `RESTIC_S3_REGION` (e.g. `eu-central-003`), `RESTIC_S3_ACCESS_KEY_ID` (the B2 keyID),
`RESTIC_S3_SECRET_ACCESS_KEY` (the B2 applicationKey) and `BACKUP_HEARTBEAT_URL`.
Keep `COMPOSE_PROFILES=local-s3` and the four fixed `S3_*` lines as they are, and
`SITE_ALLOW_INDEXING=false` for now. A forgotten required value makes step 5 stop
with its name.

**Save a copy of the finished `.env` in your password manager.** Without it — above
all `RESTIC_PASSWORD` — the backups cannot be read and a dead server cannot be rebuilt.

<details>
<summary>Alternative backup target: a Hetzner Storage Box over SFTP</summary>

Leave the two `RESTIC_S3_*` values empty and set
`RESTIC_REPOSITORY=sftp:storagebox:glh-restic`. Then:

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

The key is mounted into the backup container at run time only; it is excluded from
every image build (`.dockerignore`).

</details>

## 5. Start

```bash
docker compose up -d --build
```

The first start takes several minutes (image builds; ClamAV loads its signatures).
Watch it come up — every service with a health check should reach
`running (healthy)` (`worker` and `caddy` have none and show `running`), and `init`
should show `exited (0)`:

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
it dumps PostgreSQL (and a separate leads database, if configured), copies every
uploaded file out of the file store, and stores an encrypted, deduplicated snapshot
in the B2 bucket (kept: the newest 7, then 14 daily, 8 weekly, 12 monthly). Every run pings `BACKUP_HEARTBEAT_URL`
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

With a split leads store the drill also creates `glh_restore_drill_leads`; drop it
the same way. `restore.sh` refuses a database that already exists and the live database and bucket
names. To also drill the files, restore them into a scratch bucket of the file store,
list it, and remove it:

```bash
docker compose exec backup sh -c '. /usr/local/bin/common.sh && rclone mkdir src:glh-drill'
```

```bash
docker compose exec backup restore.sh latest glh_restore_drill2 glh-drill
```

```bash
docker compose exec backup sh -c '. /usr/local/bin/common.sh && rclone ls src:glh-drill && rclone purge src:glh-drill'
```

(then drop `glh_restore_drill2` and remove `/restore` as above).

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

If `restore.sh` stops with an error part-way, the half-restored database exists and a
re-run refuses it: drop it again (`dropdb` above) and re-run.

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

**Server gone entirely:** create a new server (steps 1–3), restore `.env` from your
password manager into `/opt/glh/.env` (and, for a Storage Box, its key into
`deploy/backup/ssh/`), set `BACKUP_ON_START=false` in `.env` (so the empty new
server is not snapshotted first), run `docker compose up -d --build`, then the
disaster recovery commands above **straight away** (the nightly run would otherwise
snapshot the empty server — harmless thanks to `--keep-last`, but noise), then set
`BACKUP_ON_START=true` again.

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
- The file store lives on the same server as the database. The nightly backup is
  its only copy off the machine: losing the VM's disk loses at most the uploads
  since the last backup.
- Oracle can change Always Free terms without notice (it halved the Ampere A1
  allowance in June 2026). If the VM is shut down or reclaimed, rebuild on any VM —
  "Server gone entirely" in §10 — and point DNS at it.

## Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` stops with "required variable … is missing a value" | Fill that value in `.env`. |
| Nothing answers on 443 and `app`/`caddy` stay `Created` | `init` failed, so nothing after it starts: `docker compose logs init`. |
| Site unreachable although `docker compose ps` is healthy (Oracle) | Ports 80/443 missing in the subnet's **Security List**, or the `iptables` rules of step 2 were not saved: `iptables -L INPUT -n --line-numbers` must show the ACCEPT for 80,443 **above** the REJECT. |
| "Out of capacity" creating the Oracle VM | Try another availability domain, try again later, or upgrade the account to Pay As You Go (step 1). |
| Browser shows a certificate error | DNS not pointing here yet, or ports 80/443 blocked — `docker compose logs caddy` shows the ACME error. |
| `init` exits 1 with "Cannot reach bucket (HTTP 403)" | On-server store: the `S3_*` keys in `.env` changed but the `s3` container was not recreated — `docker compose up -d` does that. Managed store: wrong keys, `S3_ENDPOINT` or `S3_REGION`. |
| `app` never becomes healthy | `docker compose logs app` — usually an invalid `.env` value (`AUTH_SECRET` shorter than 32 bytes, `SITE_DOMAIN`). The site still answers 502 meanwhile. |
| `worker` keeps restarting | `EMAIL_PROVIDER` must be `resend` with `EMAIL_API_KEY` set — production refuses a non-delivering transport. |
| RFQ form says "forbidden" | `SITE_DOMAIN` must be exactly the host in the browser's address bar (`www.…`). |
| Uploads rejected as unscannable | ClamAV still starting (up to ~6 min after boot) — `docker compose ps` shows `clamav` health. Inquiries without a file are unaffected. |
| Changed `POSTGRES_PASSWORD` and now nothing connects | The password is set only when the database is first created. Put the old value back, or change it in the database first: `docker compose exec postgres psql -U glh -d greenlighthouse -c "ALTER USER glh PASSWORD '<new>'"`, then update `.env` and `docker compose up -d`. |
| Backup log says "REFUSING: the bucket holds …" | See §10 — confirm the drop is intended, then run once with `BACKUP_ALLOW_SHRINK=yes`. |
