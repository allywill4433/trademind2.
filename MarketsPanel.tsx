"use client";

import { useCallback, useEffect, useState } from "react";
import CandleChart, { type ChartBar, type ChartPoint } from "./CandleChart";
import { Badge, Button, Card, Sparkline, api, inputClass, pct, price, toneClass, usd } from "./ui";
import { TIMEFRAMES, type Timeframe } from "@/lib/market/universe";

type Quote = {
  symbol: string;
  name: string;
  assetClass: "stock" | "crypto";
  price: number;
  changePct: number;
  marketOpen: boolean;
  source: "live" | "simulated";
  spark: number[];
};

type Detail = {
  symbol: string;
  name: string;
  assetClass: "stock" | "crypto";
  timeframe: Timeframe;
  source: "live" | "simulated";
  marketOpen: boolean;
  price: number;
  bars: ChartBar[];
  overlays: Record<string, ChartPoint[]>;
  regime: "uptrend" | "downtrend" | "range";
  sentiment: number;
  strategies: Array<{
    id: string;
    name: string;
    description: string;
    signal: { action: "buy" | "sell" | "hold"; confidence: number; reason: string };
    memory: { trades: number; winRate: number | null; confidence: number; kelly: number };
  }>;
};

const SIGNAL_COLOR = { buy: "green", sell: "red", hold: "slate" } as const;

export default function MarketsPanel({
  mode,
  killSwitch,
  focusSymbol,
}: {
  mode: "paper" | "live";
  killSwitch: boolean;
  focusSymbol?: string | null;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [symbol, setSymbol] = useState("BTC-USD");

  useEffect(() => {
    if (focusSymbol) setSymbol(focusSymbol);
  }, [focusSymbol]);
  const [tf, setTf] = useState<Timeframe>("5m");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [amount, setAmount] = useState("25");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    try {
      const d = await api<{ quotes: Quote[] }>("/api/market");
      setQuotes(d.quotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotes");
    }
  }, []);

  const loadDetail = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/market?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
      setDetail(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
    }
  }, [symbol, tf]);

  useEffect(() => {
    loadQuotes();
    const t = setInterval(loadQuotes, 30_000);
    return () => clearInterval(t);
  }, [loadQuotes]);

  useEffect(() => {
    loadDetail();
    const t = setInterval(loadDetail, 20_000);
    return () => clearInterval(t);
  }, [loadDetail]);

  async function trade(side: "buy" | "sell") {
    setBusy(true);
    setMessage(null);
    try {
      if (orderType === "limit") {
        const lp = Number(limitPrice);
        if (!Number.isFinite(lp) || lp <= 0) throw new Error("Enter a valid limit price");
        const body =
          side === "buy"
            ? { side, symbol, notional: Number(amount), orderType: "limit", limitPrice: lp }
            : { side, symbol, all: true, orderType: "limit", limitPrice: lp };
        const res = await api<{ limit: { filled: boolean; message: string } }>("/api/trade", body);
        setMessage({ ok: true, text: res.limit.message });
        loadDetail();
        return;
      }
      const body = side === "buy" ? { side, symbol, notional: Number(amount) } : { side, symbol, all: true };
      const res = await api<{ fill: { price: number; realizedPnlPct: number | null } }>("/api/trade", body);
      setMessage({
        ok: true,
        text:
          side === "buy"
            ? `Bought ${symbol} for ${usd(Number(amount))} @ ${price(res.fill.price)}`
            : `Sold ${symbol} @ ${price(res.fill.price)} (${pct(res.fill.realizedPnlPct)})`,
      });
      loadDetail();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Order failed" });
    } finally {
      setBusy(false);
    }
  }

  const current = quotes.find((q) => q.symbol === symbol);

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      <Card title="Watchlist" className="p-2">
        <div className="max-h-[760px] space-y-1 overflow-auto pr-1">
          {quotes.length === 0 && <div className="p-3 text-sm text-slate-500">Loading markets…</div>}
          {quotes.map((q) => (
            <button
              key={q.symbol}
              onClick={() => setSymbol(q.symbol)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                q.symbol === symbol ? "bg-slate-800 ring-1 ring-emerald-500/40" : "hover:bg-slate-800/60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-100">{q.symbol}</span>
                  {q.assetClass === "crypto" ? <Badge color="violet">24/7</Badge> : null}
                </div>
                <div className="truncate text-[11px] text-slate-500">{q.name}</div>
              </div>
              <Sparkline values={q.spark} width={60} height={24} />
              <div className="w-20 text-right">
                <div className="tabular-nums text-slate-100">{price(q.price)}</div>
                <div className={`text-xs tabular-nums ${toneClass(q.changePct)}`}>{pct(q.changePct)}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-100">{symbol}</h2>
                <span className="text-sm text-slate-500">{current?.name}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-2xl font-semibold tabular-nums text-slate-100">{price(current?.price)}</span>
                <span className={`text-sm font-medium tabular-nums ${toneClass(current?.changePct)}`}>
                  {pct(current?.changePct)} today
                </span>
                {detail?.source === "live" ? (
                  <Badge color="green">Live data</Badge>
                ) : (
                  <Badge color="amber">Simulated feed</Badge>
                )}
                {detail?.assetClass === "crypto" ? (
                  <Badge color="violet">Crypto · 24/7</Badge>
                ) : (
                  <Badge color={detail?.marketOpen ? "green" : "slate"}>
                    Stocks {detail?.marketOpen ? "open" : "closed"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    tf === t ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[420px]">
            {detail ? (
              <CandleChart key={`${symbol}-${tf}`} bars={detail.bars} overlays={detail.overlays} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-slate-500">Loading chart…</div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span><span className="text-sky-400">■</span> EMA 12</span>
            <span><span className="text-amber-400">■</span> EMA 26</span>
            <span><span className="text-violet-400">■</span> EMA 50</span>
            <span><span className="text-slate-500">■</span> Bollinger bands</span>
            <span>Green/red bars = volume</span>
          </div>
          {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
        </Card>

        <Card
          title="AI signals right now"
          right={
            detail ? (
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span>
                  Regime: <span className="font-medium text-slate-200">{detail.regime}</span>
                </span>
                <span>·</span>
                <span>
                  News sentiment:{" "}
                  <span className={`font-medium ${toneClass(detail.sentiment)}`}>{detail.sentiment.toFixed(2)}</span>
                </span>
              </div>
            ) : null
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {detail?.strategies.map((s) => (
              <div key={s.id} className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{s.name}</span>
                  <Badge color={SIGNAL_COLOR[s.signal.action]}>{s.signal.action}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {s.signal.action === "hold" ? "No setup right now" : s.signal.reason}
                </div>
                <div className="mt-auto pt-3 text-[11px] text-slate-400">
                  Confidence{" "}
                  <span className="tabular-nums text-slate-200">
                    {s.signal.action === "hold" ? "—" : `${Math.round(s.signal.confidence * 100)}%`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  AI memory:{" "}
                  <span className="tabular-nums text-slate-200">
                    {s.memory.trades} trades
                    {s.memory.winRate !== null ? ` · ${s.memory.winRate.toFixed(0)}% win` : ""}
                  </span>
                </div>
              </div>
            )) ?? <div className="text-sm text-slate-500">Loading signals…</div>}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Order ticket">
          {mode === "live" ? (
            <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              LIVE mode: orders go to your real broker account.
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
              Paper mode: fake money. Prices are real, fills are simulated with fees and slippage.
            </div>
          )}
          {killSwitch && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              Kill switch is on: buys are disabled.
            </div>
          )}
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-400">Order type</div>
              <div className="flex gap-1 rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800">
                {(["market", "limit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize ${
                      orderType === t ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {orderType === "limit" && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-400">Limit price</div>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  placeholder={current ? String(current.price) : "0.00"}
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Buys fill at or below this price; sells fill at or above it. Unfilled paper orders stay queued.
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-slate-400">Amount (USD)</div>
              <input
                className={inputClass}
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["10", "25", "100", "500"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" className="w-full" disabled={busy || killSwitch} onClick={() => trade("buy")}>
              Buy {symbol}
            </Button>
            <Button variant="danger" className="w-full" disabled={busy} onClick={() => trade("sell")}>
              Sell entire {symbol} position
            </Button>
            {message && (
              <div className={`rounded-lg p-2 text-xs ${message.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                {message.text}
              </div>
            )}
            {detail && detail.strategies.some((s) => s.signal.action === "buy") && (
              <div className="rounded-lg bg-slate-950 p-2 text-[11px] text-slate-400">
                Buy setups are active on this chart. The agent will trade them automatically when its risk rules allow.
              </div>
            )}
          </div>
        </Card>

        <Card title="How the AI trades">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>1. Five strategies scan every symbol each minute.</li>
            <li>2. It checks the market regime (uptrend, downtrend, range) and what each strategy has done there.</li>
            <li>3. It samples its learned win rates (Thompson sampling) to pick the strategy it trusts most.</li>
            <li>4. Size is set by your risk per trade, capped by max position size and a Kelly factor.</li>
            <li>5. Every position gets an ATR stop-loss that trails upward, plus a take-profit target.</li>
            <li>6. Each closed trade updates its memory, so the AI learns from its own results.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
