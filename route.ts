import { NextResponse } from "next/server";
import { ensureBootstrap, getConfig, getPortfolio, liveTradingEnabled } from "@/lib/settings";
import { executeFill, loadPositions, logEvent, placeLimitOrder } from "@/lib/trading/ledger";
import { getAsset } from "@/lib/market/universe";
import { getSnapshot, isMarketOpen } from "@/lib/market/data";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// POST /api/trade
//   { side: "buy", symbol: "BTC-USD", notional: 50 }        buy $50 of BTC
//   { side: "sell", symbol: "BTC-USD", all: true }          sell the whole position
//   { action: "flatten" }                                   close every open position
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    await ensureBootstrap();
    const cfg = await getConfig();

    if (cfg.mode === "live" && !liveTradingEnabled()) {
      return fail("Live trading is locked. Set LIVE_TRADING_ENABLED=true in .env to place real orders.", 403);
    }
    const portfolio = await getPortfolio(cfg.mode);

    if (body.action === "flatten") {
      const pos = await loadPositions(portfolio.id);
      const results: Array<Record<string, unknown>> = [];
      for (const p of pos) {
        const snap = await getSnapshot(p.symbol);
        if (p.assetClass === "stock" && !snap.marketOpen) {
          results.push({ symbol: p.symbol, skipped: "market closed" });
          continue;
        }
        const fill = await executeFill({
          portfolioId: portfolio.id,
          mode: cfg.mode,
          symbol: p.symbol,
          assetClass: p.assetClass as "stock" | "crypto",
          side: "sell",
          qty: p.qty,
          refPrice: snap.price,
          source: "manual",
          reason: "Flatten all",
        });
        results.push({ symbol: p.symbol, pnlPct: fill.realizedPnlPct, price: fill.price });
      }
      await logEvent("info", `Flatten all executed (${results.length} position(s))`);
      return NextResponse.json({ ok: true, results });
    }

    const side = body.side;
    const symbol = String(body.symbol ?? "");
    if (side !== "buy" && side !== "sell") return fail("side must be 'buy' or 'sell'");
    const asset = getAsset(symbol);
    if (!asset) return fail(`Unknown symbol ${symbol}`);

    if (side === "buy" && cfg.killSwitch) {
      return fail("Kill switch is on. New buys are disabled (sells still work). Turn it off in Settings.", 423);
    }
    if (asset.assetClass === "stock" && !isMarketOpen("stock")) {
      return fail("US stock market is closed (Mon–Fri 9:30–16:00 ET). Crypto trades 24/7.", 409);
    }

    const snap = await getSnapshot(symbol);
    const orderType = body.orderType === "limit" ? "limit" : "market";
    const limitPrice = Number(body.limitPrice);

    if (orderType === "limit") {
      if (!Number.isFinite(limitPrice) || limitPrice <= 0) return fail("limitPrice must be greater than zero");
      let notional: number | undefined;
      let qty: number | undefined;
      if (side === "buy") {
        notional = Number(body.notional);
        if (!Number.isFinite(notional) || notional <= 0) return fail("notional (USD) must be greater than zero");
      } else {
        const held = (await loadPositions(portfolio.id)).find((p) => p.symbol === symbol);
        if (!held) return fail(`You don't hold ${symbol}`);
        qty = body.all || body.qty === undefined ? held.qty : Number(body.qty);
        if (!Number.isFinite(qty) || qty <= 0) return fail("qty must be greater than zero");
      }
      const result = await placeLimitOrder({
        portfolioId: portfolio.id,
        mode: cfg.mode,
        symbol,
        assetClass: asset.assetClass,
        side,
        notional,
        qty,
        limitPrice,
        refPrice: snap.price,
        source: "manual",
        reason: "Manual limit order",
      });
      return NextResponse.json({ ok: true, limit: result });
    }

    let fill;
    if (side === "buy") {
      const notional = Number(body.notional);
      if (!Number.isFinite(notional) || notional <= 0) return fail("notional (USD) must be greater than zero");
      fill = await executeFill({
        portfolioId: portfolio.id,
        mode: cfg.mode,
        symbol,
        assetClass: asset.assetClass,
        side: "buy",
        notional,
        refPrice: snap.price,
        source: "manual",
        reason: "Manual order",
      });
    } else {
      const held = (await loadPositions(portfolio.id)).find((p) => p.symbol === symbol);
      if (!held) return fail(`You don't hold ${symbol}`);
      const qty = body.all || body.qty === undefined ? held.qty : Number(body.qty);
      if (!Number.isFinite(qty) || qty <= 0) return fail("qty must be greater than zero");
      fill = await executeFill({
        portfolioId: portfolio.id,
        mode: cfg.mode,
        symbol,
        assetClass: asset.assetClass,
        side: "sell",
        qty,
        refPrice: snap.price,
        source: "manual",
        reason: "Manual order",
      });
    }
    return NextResponse.json({ ok: true, fill });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Trade failed", 400);
  }
}
