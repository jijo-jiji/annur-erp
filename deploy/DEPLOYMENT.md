# Putting the An Nur system on a live server

This sets the system up on one Linux server (Ubuntu 24.04 LTS) behind a domain name with HTTPS, with nightly
backups. It takes about an hour the first time. Nothing here needs the developer afterwards: updates are one
command, and every business setting is changed by Management inside the app.

## What you need first

| Item | Notes |
|---|---|
| A server | Ubuntu 24.04, 1 vCPU, 2 GB RAM, 25 GB disk is plenty for one centre. Any provider. |
| A domain name | For example `erp.annur.my`. Add an **A record** pointing to the server's IP address. |
| SSH access | A user that can use `sudo`. |
| Your computer | With Node.js 22 (to build the web app) and OpenSSH (`scp`). |

Use `erp.example.com` below as a stand-in for the real address.

## 1. Prepare the server

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
sudo apt update && sudo apt -y upgrade
sudo apt -y install python3-venv python3-pip git nginx certbot python3-certbot-nginx sqlite3 ufw
sudo ufw allow OpenSSH && sudo ufw allow "Nginx Full" && sudo ufw --force enable
```

Create the service user and the folders:

```bash
sudo useradd --system --home-dir /opt/annur --shell /usr/sbin/nologin annur
sudo mkdir -p /opt/annur /var/lib/annur /etc/annur /var/www/annur
sudo chown annur:annur /opt/annur /var/lib/annur
sudo chmod 750 /var/lib/annur
sudo chown "$USER" /var/www/annur
```

## 2. Get the code and install it

If the GitHub repository is private, use a read-only deploy key or token for the clone.

```bash
sudo -u annur git clone https://github.com/jijo-jiji/annur-erp.git /opt/annur
sudo -u annur python3 -m venv /opt/annur/venv
sudo -u annur /opt/annur/venv/bin/pip install -r /opt/annur/backend/requirements-production.txt
```

## 3. Configure

```bash
sudo cp /opt/annur/deploy/annur.env.example /etc/annur/annur.env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"     # copy this output
sudo nano /etc/annur/annur.env                                      # paste it, set ANNUR_HOSTS
sudo chown root:annur /etc/annur/annur.env && sudo chmod 640 /etc/annur/annur.env
```

The system will not start if the secret or the address is missing or weak. That is intentional.

## 4. Create the database and the first login

`manage.sh` runs a command with the live settings, as the service user:

```bash
sudo bash /opt/annur/deploy/manage.sh migrate
sudo bash /opt/annur/deploy/manage.sh seed_data --reference-only
sudo bash /opt/annur/deploy/manage.sh create_management --username pengarah --name "Nama Penuh"
```

- `seed_data --reference-only` loads the centre's subjects, fee packages, time slots, master lists and centre
  details. It creates **no** students, teachers, staff, invoices or logins. It refuses to run on a database that
  already has fee packages, so it cannot overwrite what the centre has changed.
- `create_management` asks for the password at the keyboard (at least 10 characters). That person creates every
  other login in the app under **Settings > Pengguna**.

## 5. Start the system

```bash
sudo cp /opt/annur/deploy/annur.service /etc/systemd/system/
sudo cp /opt/annur/deploy/annur-backup.service /opt/annur/deploy/annur-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now annur annur-backup.timer
sudo systemctl status annur --no-pager
```

## 6. Web server and HTTPS

```bash
sudo cp /opt/annur/deploy/nginx-annur.conf /etc/nginx/sites-available/annur
sudo sed -i 's/erp.example.com/YOUR-REAL-ADDRESS/' /etc/nginx/sites-available/annur
sudo ln -s /etc/nginx/sites-available/annur /etc/nginx/sites-enabled/annur
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR-REAL-ADDRESS        # adds HTTPS and the redirect; renews itself
```

## 7. Upload the web app (from your own computer)

The server does not need Node.js. Build on your computer and copy the result:

```bash
cd frontend
npm ci
npm run build
scp -r dist/* YOUR-USER@YOUR-REAL-ADDRESS:/var/www/annur/
```

Open `https://YOUR-REAL-ADDRESS`, sign in as the Management login and check the dashboard loads.

## 8. First day for the centre

Management does these in the app, once:

1. **Settings > Pusat:** TIN, bank name, account number and holder (printed on receipts and vouchers), the
   centre's WhatsApp number, address and opening details.
2. **Settings > Pengguna:** create the Admin and Supervisor logins. Each gets a temporary password and must
   choose their own at first sign-in.
3. **Settings > Slot & bilik:** add the classrooms and check the time slots.
4. **Settings > Pakej yuran / Diskaun:** check the fee packages and add Darjah 1-4 when ready.
5. **Teachers and Timetable:** add the teachers (with their own phone and bank details) and the classes.

## Backups

- A backup of the database **and** all uploaded files is written every night at 02:30 to
  `/var/lib/annur/backups` (30 days kept). Take one by hand any time:
  `sudo systemctl start annur-backup.service`
- A backup on the same server does not protect against losing the server. Copy the folder somewhere else
  regularly, for example from your computer: `scp -r YOUR-USER@YOUR-REAL-ADDRESS:/var/lib/annur/backups .`
  (or use the provider's server snapshots as well).
- The archives hold students' and staff's personal data. Keep the copies private.

### Restore

```bash
sudo systemctl stop annur
cd /tmp && sudo tar xzf /var/lib/annur/backups/annur-YYYYMMDD-HHMMSS.tar.gz
sudo mv /var/lib/annur/db.sqlite3 /var/lib/annur/db.sqlite3.before-restore
sudo rm -f /var/lib/annur/db.sqlite3-wal /var/lib/annur/db.sqlite3-shm
sudo mv /tmp/db.sqlite3 /var/lib/annur/db.sqlite3
sudo rm -rf /var/lib/annur/uploads && sudo mv /tmp/uploads /var/lib/annur/uploads
sudo chown -R annur:annur /var/lib/annur
sudo systemctl start annur
```

## Updating later

On the server (takes a backup first, then updates and restarts):

```bash
sudo bash /opt/annur/deploy/update.sh
```

If screens changed, rebuild and upload the web app again (step 7). Check after an update with
`sudo journalctl -u annur -n 30 --no-pager`.

## If something is wrong

| Symptom | Look at |
|---|---|
| Site shows "502 Bad Gateway" | `sudo systemctl status annur` and `sudo journalctl -u annur -n 50 --no-pager` |
| The service will not start | Almost always the env file: missing `DJANGO_SECRET_KEY` or `ANNUR_HOSTS`. The log names the setting. |
| "Invalid HTTP_HOST header" in the log | The address typed in the browser is not in `ANNUR_HOSTS` |
| Login says too many attempts | The login limit is 10 per minute per visitor; wait a minute |
| Uploads fail with "413" | `client_max_body_size` in the nginx file (default 210m) |

## What is deliberately not here

- The Django admin site (`/admin/`) is switched off on the live server because it would bypass the approval
  rules. All administration is through the app.
- No outgoing e-mail or WhatsApp sending: staff press send in WhatsApp themselves.
- The database is a single SQLite file, which suits one centre with nightly backups. If the centre grows
  to several branches writing at once, moving to PostgreSQL is the next step.
