"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EquityChart, Stat, api, clock, inputClass, pct, price, timeAgo, toneClass, usd } from "./ui";
import { UNIVERSE, TIMEFRAMES, type Timeframe } from "@/lib/market/universe";
import { STRATEGIES } from "@/lib/strategies";

type AgentData = {
  config: {
    agentEnabled: boolean;
    killSwitch: boolean;
    mode: "paper" | "live";
    liveBroker: string;
    liveEnabled: boolean;
    minConfidence: number;
    riskPerTradePct: number;
    maxOpenPositions: number;
  };
  runtime: { lastCycleAt?: string; lastCycleSummary?: string; lastError?: string; cycles?: number };
  leaderboard: Array<{
    strategy: string;
    assetClass: string;
    regime: string;
    wins: number;
    losses: number;
    trades: number;
    winRate: number;
    avgWinPct: number;
    avgLossPct: number;
    expectancyPct: number;
    confidence: number;
    kelly: number;
  }>;
  events: Array<{ id: number; kind: string; message: string; createdAt: string }>;
  markets: { stock: boolean; crypto: boolean };
};

type BacktestResult = {
  symbol: string;
  timeframe: Timeframe;
  source: "live" | "simulated";
  bars: number;
  startingCash: number;
  finalEquity: number;
  totalReturnPct: number;
  buyHoldPct: number;
  trades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  curve: { time: number; equity: number }[];
  recentTrades: Array<{
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    pnlUsd: number;
    pnlPct: number;
    entryReason: string;
    exitReason: string;
  }>;
};

const KIND_COLOR: Record<string, "green" | "red" | "amber" | "sky" | "violet" | "slate"> = {
  trade: "green",
  learn: "violet",
  block: "amber",
  error: "red",
  info: "sky",
};

const strategyName = (id: string) => STRATEGIES.find((s) => s.id === id)?.name ?? id;

export default function AgentPanel() {
  const [data, setData] = useState<AgentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [btSymbol, setBtSymbol] = useState("BTC-USD");
  const [btTf, setBtTf] = useState<Timeframe>("5m");
  const [btStrategy, setBtStrategy] = useState("consensus");
  const [btBusy, setBtBusy] = useState(false);
  const [bt, setBt] = useState<BacktestResult | null>(null);
  const [btError, setBtError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AgentData>("/api/agent"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function setSetting(patch: Record<string, unknown>, message: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/settings", patch);
      setNotice(message);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ ran: boolean; reason?: string; actions: string[] }>("/api/agent", { action: "run" });
      setNotice(res.ran ? `Cycle complete · ${res.actions.length} action(s)` : `Cycle skipped: ${res.reason}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Cycle failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBacktest() {
    setBtBusy(true);
    setBtError(null);
    try {
      const res = await api<BacktestResult>(
        `/api/backtest?symbol=${encodeURIComponent(btSymbol)}&tf=${btTf}&strategy=${btStrategy}`,
      );
      setBt(res);
    } catch (e) {
      setBtError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setBtBusy(false);
    }
  }

  const cfg = data?.config;
  const status = !cfg
    ? { label: "Loading", color: "slate" as const }
    : cfg.killSwitch
      ? { label: "Kill switch on", color: "red" as const }
      : cfg.agentEnabled
        ? { label: "AI active", color: "green" as const }
        : { label: "Paused", color: "amber" as const };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {cfg?.agentEnabled && !cfg.killSwitch && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  cfg?.killSwitch ? "bg-rose-500" : cfg?.agentEnabled ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-100">Autonomous trading agent</h2>
                <Badge color={status.color}>{status.label}</Badge>
                {cfg && <Badge color={cfg.mode === "live" ? "red" : "green"}>{cfg.mode}</Badge>}
              </div>
              <p className="text-xs text-slate-500">
                Runs every minute on the server, even with this page closed. Learns from every closed trade.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={cfg?.agentEnabled ? "default" : "primary"}
              disabled={busy || !cfg}
              onClick={() =>
                setSetting(
                  { agentEnabled: !cfg?.agentEnabled },
                  cfg?.agentEnabled ? "Agent paused" : "Agent started",
                )
              }
            >
              {cfg?.agentEnabled ? "Pause agent" : "Start agent"}
            </Button>
            <Button disabled={busy} onClick={runNow}>
              Run a cycle now
            </Button>
            <Button
              variant={cfg?.killSwitch ? "default" : "danger"}
              disabled={busy || !cfg}
              onClick={() => {
                if (!cfg?.killSwitch && !confirm("Turn on the kill switch? New buys will stop. Exits keep working.")) return;
                setSetting({ killSwitch: !cfg?.killSwitch }, cfg?.killSwitch ? "Kill switch off" : "Kill switch on");
              }}
            >
              {cfg?.killSwitch ? "Release kill switch" : "Kill switch"}
            </Button>
          </div>
        </div>
        {notice && <div className="mt-3 text-xs text-slate-300">{notice}</div>}
        {error && <div className="mt-3 text-xs text-rose-400">{error}</div>}
        {data?.runtime.lastError && (
          <div className="mt-3 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">Last error: {data.runtime.lastError}</div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Stat label="Last cycle" value={timeAgo(data?.runtime.lastCycleAt)} sub={data?.runtime.lastCycleSummary} />
          <Stat label="Cycles run" value={data?.runtime.cycles ?? 0} />
          <Stat label="Stocks" value={data?.markets.stock ? "Open" : "Closed"} sub="NYSE 9:30–16:00 ET" />
          <Stat label="Crypto" value="24/7" sub="Always trading" />
          <Stat label="Risk / trade" value={`${cfg?.riskPerTradePct ?? "—"}%`} sub="of equity at stop" />
          <Stat label="Min confidence" value={cfg ? `${Math.round(cfg.minConfidence * 100)}%` : "—"} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="What the AI has learned" right={<span className="text-xs text-slate-500">ranked by expectancy</span>}>
          {!data || data.leaderboard.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
              No closed trades yet. The AI starts with no bias and learns as its paper trades close. Run a few cycles or
              try a backtest.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Strategy</th>
                    <th className="py-2 pr-3 font-medium">Market</th>
                    <th className="py-2 pr-3 font-medium">Regime</th>
                    <th className="py-2 pr-3 text-right font-medium">Trades</th>
                    <th className="py-2 pr-3 text-right font-medium">Win rate</th>
                    <th className="py-2 pr-3 text-right font-medium">Avg win / loss</th>
                    <th className="py-2 pr-3 text-right font-medium">Expectancy</th>
                    <th className="py-2 font-medium">AI verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.leaderboard.map((row) => {
                    const verdict =
                      row.trades < 5
                        ? { label: "Learning", color: "amber" as const }
                        : row.kelly > 0
                          ? { label: "Trusted", color: "green" as const }
                          : { label: "Blocked", color: "red" as const };
                    return (
                      <tr key={`${row.strategy}-${row.assetClass}-${row.regime}`}>
                        <td className="py-2 pr-3 text-slate-200">{strategyName(row.strategy)}</td>
                        <td className="py-2 pr-3 text-slate-400">{row.assetClass}</td>
                        <td className="py-2 pr-3 text-slate-400">{row.regime}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.trades}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.winRate.toFixed(0)}%</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className="text-emerald-400">+{row.avgWinPct.toFixed(2)}%</span> /{" "}
                          <span className="text-rose-400">-{row.avgLossPct.toFixed(2)}%</span>
                        </td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${toneClass(row.expectancyPct)}`}>
                          {pct(row.expectancyPct)}
                        </td>
                        <td className="py-2">
                          <Badge color={verdict.color}>{verdict.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {STRATEGIES.map((s) => (
              <div key={s.id} className="rounded-lg bg-slate-950/60 p-2.5">
                <div className="text-xs font-medium text-slate-200">{s.name}</div>
                <div className="text-[11px] leading-snug text-slate-500">{s.description}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Agent activity" right={<span className="text-xs text-slate-500">{data?.events.length ?? 0} events</span>}>
          <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
            {data?.events.length === 0 && <div className="text-sm text-slate-500">No activity yet.</div>}
            {data?.events.map((e) => (
              <div key={e.id} className="rounded-lg bg-slate-950/60 p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge color={KIND_COLOR[e.kind] ?? "slate"}>{e.kind}</Badge>
                  <span className="text-[11px] text-slate-500">{clock(e.createdAt)}</span>
                </div>
                <div className="text-xs leading-relaxed text-slate-300">{e.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Backtest · test a strategy on history before risking anything">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
          <select className={inputClass} value={btSymbol} onChange={(e) => setBtSymbol(e.target.value)}>
            {UNIVERSE.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </select>
          <select className={inputClass} value={btTf} onChange={(e) => setBtTf(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t}>
                {t} candles
              </option>
            ))}
          </select>
          <select className={inputClass} value={btStrategy} onChange={(e) => setBtStrategy(e.target.value)}>
            <option value="consensus">Consensus (2+ strategies agree)</option>
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={btBusy} onClick={runBacktest}>
            {btBusy ? "Running…" : "Run backtest"}
          </Button>
        </div>
        {btError && <div className="mt-3 text-xs text-rose-400">{btError}</div>}
        {bt && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Stat label="Strategy return" value={pct(bt.totalReturnPct)} tone={toneClass(bt.totalReturnPct)} sub={`from ${usd(bt.startingCash, 0)}`} />
              <Stat label="Buy & hold" value={pct(bt.buyHoldPct)} tone={toneClass(bt.buyHoldPct)} sub="same period" />
              <Stat label="Trades" value={bt.trades} />
              <Stat label="Win rate" value={`${bt.winRate.toFixed(0)}%`} />
              <Stat label="Profit factor" value={bt.profitFactor.toFixed(2)} sub="gross win ÷ gross loss" />
              <Stat label="Max drawdown" value={`-${bt.maxDrawdownPct.toFixed(1)}%`} tone="text-rose-300" />
              <Stat label="Data" value={bt.source === "live" ? "Live" : "Simulated"} sub={`${bt.bars} candles`} />
            </div>
            <EquityChart points={bt.curve} height={200} />
            {bt.recentTrades.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Entry</th>
                      <th className="py-2 pr-3 text-right font-medium">Price in</th>
                      <th className="py-2 pr-3 text-right font-medium">Price out</th>
                      <th className="py-2 pr-3 text-right font-medium">P&amp;L</th>
                      <th className="py-2 pr-3 font-medium">Why</th>
                      <th className="py-2 font-medium">Exit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {bt.recentTrades.map((t, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 pr-3 text-slate-400">{clock(new Date(t.entryTime * 1000))}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{price(t.entryPrice)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{price(t.exitPrice)}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${toneClass(t.pnlPct)}`}>{pct(t.pnlPct)}</td>
                        <td className="max-w-[260px] truncate py-1.5 pr-3 text-slate-400">{t.entryReason}</td>
                        <td className="py-1.5 text-slate-400">{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
