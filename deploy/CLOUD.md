# Putting the An Nur system on Vercel, Render, Neon and Cloudflare R2

This is the hosted way to run the system: no server to look after, and every update is a `git push`. The other
way, one Linux server with nginx and SQLite, is in [DEPLOYMENT.md](DEPLOYMENT.md). Use one or the other.

| Part | Service | What it holds |
|---|---|---|
| The web app (what people open) | **Vercel** | The built screens. Nothing private is stored here. |
| The system itself (API) | **Render** | The Django program. It has no permanent disk. |
| The data | **Neon** | PostgreSQL: students, invoices, receipts, teachers, logins. |
| Uploaded files | **Cloudflare R2** | Photos, IC copies, vouchers, handouts, videos. A private bucket. |

```
 browser ──► Vercel   (the screens)
    │
    └──────► Render ──► Neon  (data)
                 └───► R2    (files)
```

The browser talks to Render directly, so uploads (a feedback video can be 200 MB) never pass through Vercel.
Signing in uses a token sent in a header, not a cookie, so the two different addresses do not get in the way.

## Before you start: what each plan means

| | Free | What to know |
|---|---|---|
| Render | Sleeps after 15 minutes without a visitor; the next visit waits about a minute. No shell. | **Starter (about US$7/month) never sleeps.** Students scan the class QR code in the classroom, so a one-minute wait there is a real problem. Start on Free to try it, move to Starter before the centre uses it. |
| Neon | Stops its compute when idle (the first query after that takes about a second). Small storage and a short restore window. | Fine for one centre. Read the restore window on the plan (Restore, below). |
| R2 | 10 GB free, no charge for downloads. | Cloudflare asks for a payment card before R2 can be switched on. |
| Vercel | Hobby plan. | Vercel's free Hobby plan is for personal, non-commercial use. A business system should be on the Pro plan. Check Vercel's current terms. |

You need accounts on all four, and the code on GitHub (Render and Vercel both read it from there). Python on your own
computer is needed once, for step 4.

## 1. Neon: the database

1. Create a project. Pick the region **AWS Asia Pacific (Singapore)**: it is next to Render's Singapore region.
2. Open **Connect** and **turn off "Connection pooling"**. Copy the connection string. It looks like
   `postgresql://user:password@ep-something.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

Keep it. It is the `DATABASE_URL`, and it contains the database password: never put it in the repository or send it in a chat.

## 2. Cloudflare R2: the files

1. **R2 Object Storage > Create bucket.** Name it `annur-files`. Location hint: Asia-Pacific. Leave it **private**:
   do not enable the public `r2.dev` address or a public domain. The system reads the files itself and shows them
   only to people who are signed in and allowed to see them.
2. **R2 > Manage API tokens > Create API token.** Permission **Object Read & Write**, restricted to the `annur-files` bucket.
3. Copy the **Access Key ID** and **Secret Access Key** (the secret is shown once), and your **Account ID** (on the R2 page).

## 3. Render: the system

1. Make sure these files are on GitHub (`render.yaml` is at the top of the repository).
2. Generate the secret key on your computer:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```
3. In Render choose **New > Blueprint**, connect the repository, and fill the values it asks for:

   | Name | Value |
   |---|---|
   | `DJANGO_SECRET_KEY` | the long value from step 2 |
   | `DATABASE_URL` | the Neon string from step 1 |
   | `R2_BUCKET` | `annur-files` |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from R2, step 2 |
   | `ANNUR_CORS_ORIGINS` | type `https://example.com` for now; step 6 replaces it |

4. Wait for the first deploy (a few minutes). Each deploy installs the packages and applies the database changes
   (`migrate`) before the new version goes live. If that fails, the old version keeps running.
5. Open `https://YOUR-SERVICE.onrender.com/healthz`. It must say `ok`. That address is the API address you need in step 5.

The system refuses to start when something is missing or weak (no secret key, a database but no R2 settings), and the
Render log says which setting. That is intentional.

## 4. First login and the centre's lists (from your computer)

The free Render plan has no shell, so the one-time setup runs on your computer against the Neon database. The tables
were created by the deploy in step 3.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-production.txt
$env:DATABASE_URL = "PASTE-THE-NEON-STRING-HERE"

python manage.py seed_data --reference-only
python manage.py create_management --username pengarah --name "Nama Penuh"
```

- `seed_data --reference-only` loads the centre's subjects, fee packages, time slots, master lists and centre details.
  It creates no students, teachers, staff, invoices or logins, and it refuses to run on a database that already has fee packages.
- `create_management` asks for the password at the keyboard (at least 10 characters). That person creates every other
  login in the app under **Settings > Pengguna**.

Close the window afterwards (the `$env:DATABASE_URL` line only lasts as long as the window).

## 5. Vercel: the screens

1. **Add New > Project**, import the repository.
2. **Root Directory: `frontend`**. The framework is detected as Vite.
3. Add an environment variable **`VITE_API_URL`** = the Render address from step 3, for example
   `https://annur-api.onrender.com` (https, no slash at the end, no `/api`).
4. Deploy. Note the address Vercel gives, for example `https://annur.vercel.app`.

`VITE_API_URL` is part of the built screens. If the API address changes, change it in Vercel and redeploy.

## 6. Tell Render where the screens are

In Render open the service > **Environment** and set `ANNUR_CORS_ORIGINS` to the Vercel address, exactly as the browser
shows it (`https://annur.vercel.app`, no slash at the end). Several addresses can be separated by commas, for example
when the centre has its own domain as well. Render restarts the service. Only the addresses listed here can use the API.

## 7. Check it

1. Open the Vercel address, sign in as the Management login.
2. Open a student, add a photo, reload the page: the photo must still be there. Check in the R2 dashboard that
   the bucket now holds a file (under `student_photo/`).
3. Open the public registration page (`#/daftar`) in a private window: it must load.

### Check the login limit

The system allows 10 sign-in attempts a minute for each visitor. To count each visitor separately it must know how many
proxies sit in front of it (`ANNUR_PROXIES`, set to 2 in `render.yaml`). Hosting platforms do not publish this number,
so check it once. Run this in PowerShell, with your API address:

```powershell
$api = "https://YOUR-SERVICE.onrender.com"
1..12 | ForEach-Object { $i = $_
  try { Invoke-RestMethod -Method Post -Uri "$api/api/v1/auth/login/" -ContentType "application/json" -Headers @{ "X-Forwarded-For" = "9.9.9.$i" } -Body '{"username":"x","password":"wrong"}' | Out-Null }
  catch { "attempt $i -> " + $_.Exception.Response.StatusCode.value__ } }
```

- Attempts 1 to 10 fail with a sign-in error, and attempts **11 and 12 say 429**. All good: a made-up
  `X-Forwarded-For` does not help, and the number is right.
- Every attempt says the same sign-in error and **none says 429**: the made-up header is being believed. Lower
  `ANNUR_PROXIES` by one in Render and run it again.
- Also open the sign-in page on a phone using mobile data (a different address) right after the run above: it must
  still be able to sign in. If it says "too many attempts", everyone is being counted as one visitor: raise
  `ANNUR_PROXIES` by one and run it again.

## 8. First day for the centre

The same as a single server: see DEPLOYMENT.md, "First day for the centre" (Settings > Pusat, Pengguna, Slot & bilik, Pakej yuran).

## Updating later

Push to `main`. Render builds, applies database changes and switches over; Vercel rebuilds the screens. Both keep the
previous version, so a bad update can be rolled back from their dashboards (Render: **Events > Rollback**; Vercel:
**Deployments > Promote** an older one). A rollback does not undo database changes, so take a backup (below) before an
update that changes the tables.

## Backups and restore

The single-server nightly backup does not apply here. What protects the data instead:

- **Neon** keeps a history of the database for a limited time, and **Restore** (in the Neon console) brings it back to
  a chosen moment. How far back depends on the plan: read it, and raise it if one day is not enough.
- **R2** keeps every file safely, but a file that is deleted is gone: there is no recycle bin.
- **A copy you hold yourself.** Once a week, from your computer (set `$env:DATABASE_URL` as in step 4):
  ```powershell
  cd backend
  python manage.py backup_data --format json --dest D:\annur-backups
  ```
  This writes `annur-YYYYMMDD-HHMMSS.tar.gz` with the whole database as text (`db.json`). It holds students' and staff's
  personal data: keep it private. For the files, copy the bucket with a tool that speaks S3, for example `rclone`, using
  the R2 address `https://ACCOUNT-ID.r2.cloudflarestorage.com` and an API token that can only read.

To restore a `db.json` into an empty database (a new Neon project or branch, or your own computer):

```powershell
$env:DATABASE_URL = "THE-NEW-DATABASE-STRING"
python manage.py migrate
python manage.py loaddata path\to\db.json
```

## Scheduled jobs (optional)

The screens do this work when they are opened, so nothing breaks without a schedule (see DEPLOYMENT.md, "Scheduled jobs").
Render's scheduled jobs are on paid plans only. If days can pass without anyone opening the dashboard, run
`generate_monthly_invoices`, `week5_followups` and `close_checkins` from your computer the same way as in step 4.

## If something is wrong

| Symptom | Look at |
|---|---|
| The sign-in page loads but nothing else, the browser console says "CORS" | `ANNUR_CORS_ORIGINS` in Render does not match the Vercel address exactly (https, no slash). |
| Every request fails with "Failed to fetch" after a while of no use | The free Render service is asleep; wait about a minute and reload. |
| The deploy fails | Render > the deploy > Logs. A missing setting is named; `migrate` errors appear here too. |
| "Invalid HTTP_HOST header" in the Render log | The address people use is not the Render address. Add it to `ANNUR_HOSTS` (for example a custom domain). |
| Photos do not show, the log mentions `InternalError` or `SignatureDoesNotMatch` | The R2 key, secret or account ID is wrong, or the token is not allowed on this bucket. |
| `could not translate host name` or `SSL` errors to the database | `DATABASE_URL` is not copied completely: it must end with `?sslmode=require`. |
| Large uploads (videos) are slow or stop | They go from the browser through Render to R2: slow on a free instance. Lower the video limit under Settings > Had & amaran, or use the Starter plan. |

## A custom domain (optional)

Give the screens their own address (Vercel > Domains), and the API its own (Render > Settings > Custom Domains, for example
`api.annur.my`). Then set `ANNUR_HOSTS=api.annur.my`, `ANNUR_CORS_ORIGINS=https://erp.annur.my`, and rebuild the
screens in Vercel with `VITE_API_URL=https://api.annur.my`.
