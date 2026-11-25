# TradeMind AI

Autonomous stocks + crypto trading terminal with 12 specialized agents, paper trading (fake money), a strategy lab, and a voice assistant.

**Default mode is paper trading.** Live broker orders stay locked until you set `LIVE_TRADING_ENABLED=true`.

## Run locally

```bash
npm ci
# put DATABASE_URL in .env (see .env.example)
npx drizzle-kit push
npm run build
npm run start
```

## Put it on your iPhone (24/7)

Follow **[DEPLOY.md](./DEPLOY.md)**. Use Railway (always-on) plus a public HTTPS URL, then Safari → Share → Add to Home Screen.

Do not open sandbox `e2b.app` links on your phone. Those are blocked on purpose.

## Safety

Not financial advice. You can lose money. Paper-trade for weeks before considering live mode. Robinhood’s official API is crypto-only.
