# Put TradeMind on your iPhone (public 24/7 URL)

This app must stay running all the time (the AI trades even when your phone is locked).
That is why we do **not** use Vercel. Use **Railway** (simplest) or a small VPS.

Time: about 20–30 minutes. Cost: Railway Hobby is typically around $5/month.

---

## Path A — Railway (recommended)

### 1. Put this project on GitHub

1. Create a free GitHub account if you do not have one: https://github.com/signup
2. On GitHub click **New repository**. Name it `trademind`. Keep it **Private**.
3. Upload this project (GitHub Desktop is easiest if you are not used to git):
   - Install https://desktop.github.com
   - File → Add Local Repository → choose this project folder
   - Publish repository to GitHub

### 2. Create the Railway project

1. Go to https://railway.app and sign up with GitHub.
2. Click **New Project** → **Deploy from GitHub repo** → pick `trademind`.
3. Railway will try to build from the Dockerfile in this repo.

### 3. Add a database

1. In the same Railway project click **New** → **Database** → **PostgreSQL**.
2. Open the **web service** (not the database) → **Variables**.
3. Click **Add Variable Reference** and attach `DATABASE_URL` from the Postgres service.
   If you do not see a reference button, copy the Postgres **Connection URL** and
   paste it as `DATABASE_URL`.

### 4. Required / optional variables

On the web service → Variables:

| Name | Required | What to put |
| --- | --- | --- |
| `DATABASE_URL` | YES | Postgres connection URL from step 3 |
| `APP_PASSWORD` | strongly recommended | A password only you know. Enables the login screen. |
| `SESSION_SECRET` | recommended | Any long random sentence |
| `LIVE_TRADING_ENABLED` | no | Leave unset. Only set `true` after paper trading looks good. |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | no | For stocks + crypto later |
| `ROBINHOOD_API_KEY` / `ROBINHOOD_BASE64_PRIVATE_KEY` | no | Crypto only, official Robinhood API |

Redeploy after saving variables.

### 5. Turn on a public URL

1. Web service → **Settings** → **Networking** → **Generate Domain**.
2. You get something like `https://trademind-production.up.railway.app`.
3. Open that URL on your **computer first**. You should see TradeMind (or the login screen).

### 6. Put it on your iPhone Home Screen

1. On the iPhone open **Safari** (not Chrome).
2. Go to your Railway URL.
3. Log in if you set `APP_PASSWORD`.
4. Tap the **Share** button (square with an arrow).
5. Scroll and tap **Add to Home Screen**.
6. Name it `TradeMind` → Add.

It now opens like a real app. The AI keeps running on Railway even if you close the phone.

---

## Path B — Your own VPS (DigitalOcean) — recommended if you want full control

This keeps TradeMind running 24/7 on a small Linux server you rent. About $6/month.
You still need the project files on GitHub (or copied onto the server).

### B1. Create the server

1. Sign up at https://www.digitalocean.com
2. Create → Droplets → Create Droplet
3. Region: closest to you
4. Image: **Ubuntu 24.04**
5. Size: **Basic** → $6/month (1 GB RAM) is enough to start
6. Auth: password or SSH key (password is easier if you are new)
7. Click **Create Droplet**
8. Copy the server IP (looks like `165.227.x.x`)

### B2. Log in

On your computer (Mac Terminal, or Windows PowerShell):

```bash
ssh root@YOUR_SERVER_IP
```

Type `yes` if it asks about the fingerprint, then enter the droplet password.

### B3. Install Docker (paste this whole block)

```bash
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### B4. Put the TradeMind code on the server

If the repo is on GitHub (private is fine):

```bash
cd /opt
git clone https://github.com/YOURNAME/trademind.git
cd trademind
```

GitHub will ask for your username and a **Personal Access Token** (not your password).
Create a token at https://github.com/settings/tokens (scope: `repo` only). Do not paste that token in this chat.

### B5. Create the env file

```bash
cp .env.example .env
nano .env
```

Set at least:

```
APP_PASSWORD=pick-a-long-password
SESSION_SECRET=any-long-random-sentence
```

Leave `LIVE_TRADING_ENABLED` unset. Docker Compose already provides `DATABASE_URL` for the bundled Postgres.

Save: Ctrl+O, Enter, Ctrl+X.

### B6. Start the app

```bash
docker compose up -d --build
```

Wait 2–5 minutes. Then on your computer open:

`http://YOUR_SERVER_IP:3000`

You should see TradeMind (or the login screen).

Check it is alive:

```bash
curl -s http://127.0.0.1:3000/api/health
```

You want `{"ok":true}`.

### B7. iPhone Home Screen

Safari on iPhone cannot install a Home Screen app from a raw `http://IP` as smoothly as from `https://`.

Best: add a domain and HTTPS (Cloudflare is free):

1. Buy or use a domain.
2. Point an A record at `YOUR_SERVER_IP`.
3. Put Cloudflare in front and turn on HTTPS, **or** install Caddy/nginx with Let’s Encrypt on the droplet.
4. Open `https://yourdomain.com` in **Safari**.
5. Share → **Add to Home Screen**.

Until HTTPS is set up you can still open `http://YOUR_SERVER_IP:3000` in Safari to use the app (just not as a perfect installed PWA).

### Useful commands

```bash
cd /opt/trademind
docker compose logs -f web      # watch the AI / errors
docker compose ps               # is it running?
docker compose restart web      # restart the app
docker compose down             # stop everything
```

---

## Safety

- Stay in **Paper** mode for weeks before considering live money.
- Never put `LIVE_TRADING_ENABLED=true` until you have watched the agent and you understand the losses.
- Robinhood’s official API is **crypto only**. Stocks need Alpaca (or another supported broker).
- This is not financial advice. You can lose money, including all of it.
