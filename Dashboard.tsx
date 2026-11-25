"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EquityChart, Sparkline, Stat, api, clock, pct, price, timeAgo, toneClass, usd } from "./ui";

type Portfolio = {
  mode: "paper" | "live";
  equity: number;
  dayPnl: number;
  dayPnlPct: number;
  weekPnl: number | null;
  weekPnlPct: number | null;
  monthPnl: number | null;
  monthPnlPct: number | null;
  totalReturnPct: number;
  winRate: number | null;
  closedTrades: number;
  realizedPnl: number;
  maxDrawdownPct: number;
  positions: Array<{ symbol: string; unrealizedPct: number; value: number; strategy: string | null }>;
  equityCurve: { time: number; equity: number }[];
};

type AgentData = {
  config: { agentEnabled: boolean; killSwitch: boolean; mode: "paper" | "live" };
  runtime: { lastCycleAt?: string; lastCycleSummary?: string; lastError?: string };
  events: Array<{ id: number; kind: string; message: string; createdAt: string }>;
  markets: { stock: boolean; crypto: boolean };
};

type Quote = {
  symbol: string;
  name: string;
  assetClass: "stock" | "crypto";
  price: number;
  changePct: number;
  spark: number[];
};

type NewsItem = { id: string; title: string; source: string; publishedAt: string; sentiment: number };

const KIND_COLOR: Record<string, "green" | "red" | "amber" | "sky" | "violet" | "slate"> = {
  trade: "green",
  learn: "violet",
  block: "amber",
  error: "red",
  info: "sky",
};

export default function Dashboard({ onNavigate }: { onNavigate: (tab: string, symbol?: string) => void }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api<Portfolio>("/api/portfolio"),
      api<AgentData>("/api/agent"),
      api<{ quotes: Quote[] }>("/api/market"),
      api<{ items: NewsItem[] }>("/api/news"),
    ]);
    const [p, a, m, n] = results;
    if (p.status === "fulfilled") setPortfolio(p.value);
    if (a.status === "fulfilled") setAgent(a.value);
    if (m.status === "fulfilled") setQuotes(m.value.quotes);
    if (n.status === "fulfilled") setNews(n.value.items.slice(0, 6));
    const failed = results.find((r) => r.status === "rejected");
    setError(failed && failed.status === "rejected" ? String(failed.reason?.message ?? failed.reason) : null);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const movers = [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 6);
  const btc = quotes.find((q) => q.symbol === "BTC-USD");
  const eth = quotes.find((q) => q.symbol === "ETH-USD");
  const status = !agent
    ? { label: "Loading", color: "slate" as const }
    : agent.config.killSwitch
      ? { label: "Kill switch on", color: "red" as const }
      : agent.config.agentEnabled
        ? { label: "AI trading", color: "green" as const }
        : { label: "Paused", color: "amber" as const };
  const exposurePct =
    portfolio && portfolio.equity > 0
      ? (portfolio.positions.reduce((s, p) => s + p.value, 0) / portfolio.equity) * 100
      : 0;
  const riskLevel =
    (portfolio?.maxDrawdownPct ?? 0) > 15 || exposurePct > 80
      ? "High"
      : (portfolio?.maxDrawdownPct ?? 0) > 7 || exposurePct > 50
        ? "Moderate"
        : "Low";

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">Some data failed to load: {error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Equity" value={usd(portfolio?.equity)} sub={portfolio?.mode === "live" ? "broker" : "paper · fake money"} />
        <Stat
          label="Today"
          value={usd(portfolio?.dayPnl)}
          sub={pct(portfolio?.dayPnlPct)}
          tone={toneClass(portfolio?.dayPnl)}
        />
        <Stat
          label="This week"
          value={portfolio?.weekPnl === null || portfolio?.weekPnl === undefined ? "—" : usd(portfolio.weekPnl)}
          sub={pct(portfolio?.weekPnlPct)}
          tone={toneClass(portfolio?.weekPnl)}
        />
        <Stat
          label="This month"
          value={portfolio?.monthPnl === null || portfolio?.monthPnl === undefined ? "—" : usd(portfolio.monthPnl)}
          sub={pct(portfolio?.monthPnlPct)}
          tone={toneClass(portfolio?.monthPnl)}
        />
        <Stat label="Total return" value={pct(portfolio?.totalReturnPct)} tone={toneClass(portfolio?.totalReturnPct)} />
        <Stat label="Realized P&L" value={usd(portfolio?.realizedPnl)} tone={toneClass(portfolio?.realizedPnl)} />
        <Stat
          label="Win rate"
          value={portfolio?.winRate == null ? "—" : `${portfolio.winRate.toFixed(0)}%`}
          sub={`${portfolio?.closedTrades ?? 0} closed trades`}
        />
        <Stat
          label="AI status"
          value={<span className="text-lg">{status.label}</span>}
          sub={timeAgo(agent?.runtime.lastCycleAt) === "—" ? "waiting for first cycle" : `cycle ${timeAgo(agent?.runtime.lastCycleAt)}`}
        />
        <Stat
          label="Bitcoin"
          value={btc ? `$${btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
          sub={btc ? pct(btc.changePct) : undefined}
          tone={toneClass(btc?.changePct)}
        />
        <Stat
          label="Ethereum"
          value={eth ? `$${eth.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
          sub={eth ? pct(eth.changePct) : undefined}
          tone={toneClass(eth?.changePct)}
        />
        <Stat label="Risk level" value={riskLevel} sub={`${exposurePct.toFixed(0)}% exposed · DD ${(portfolio?.maxDrawdownPct ?? 0).toFixed(1)}%`} />
        <Stat label="Max drawdown" value={`-${(portfolio?.maxDrawdownPct ?? 0).toFixed(1)}%`} tone={(portfolio?.maxDrawdownPct ?? 0) > 0 ? "text-rose-300" : ""} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title="Equity curve"
          right={
            <button onClick={() => onNavigate("portfolio")} className="text-xs text-emerald-400 hover:underline">
              Open portfolio →
            </button>
          }
        >
          <EquityChart points={portfolio?.equityCurve ?? []} height={240} />
          {agent?.runtime.lastCycleSummary && (
            <div className="mt-2 text-xs text-slate-500">Last cycle: {agent.runtime.lastCycleSummary}</div>
          )}
        </Card>

        <Card
          title="Agent activity"
          right={
            <button onClick={() => onNavigate("agent")} className="text-xs text-emerald-400 hover:underline">
              Details →
            </button>
          }
        >
          <div className="max-h-[300px] space-y-2 overflow-auto pr-1">
            {agent?.events.length === 0 && <div className="text-sm text-slate-500">No activity yet.</div>}
            {agent?.events.slice(0, 10).map((e) => (
              <div key={e.id} className="rounded-lg bg-slate-950/60 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <Badge color={KIND_COLOR[e.kind] ?? "slate"}>{e.kind}</Badge>
                  <span className="text-[10px] text-slate-500">{clock(e.createdAt)}</span>
                </div>
                <div className="text-xs leading-snug text-slate-300">{e.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Top movers">
          <div className="space-y-1">
            {movers.map((q) => (
              <button
                key={q.symbol}
                onClick={() => onNavigate("markets", q.symbol)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-100">{q.symbol}</div>
                  <div className="text-[11px] text-slate-500">{q.name}</div>
                </div>
                <Sparkline values={q.spark} width={70} height={24} />
                <div className="w-24 text-right">
                  <div className="text-sm tabular-nums text-slate-100">{price(q.price)}</div>
                  <div className={`text-xs tabular-nums ${toneClass(q.changePct)}`}>{pct(q.changePct)}</div>
                </div>
              </button>
            ))}
            {movers.length === 0 && <div className="text-sm text-slate-500">Loading markets…</div>}
          </div>
        </Card>

        <Card title="Open positions">
          <div className="space-y-2">
            {portfolio?.positions.length === 0 && (
              <div className="text-sm text-slate-500">Nothing open. The agent is watching the market.</div>
            )}
            {portfolio?.positions.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-100">{p.symbol}</div>
                  <div className="text-[11px] text-slate-500">{p.strategy ?? "manual"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums text-slate-100">{usd(p.value)}</div>
                  <div className={`text-xs tabular-nums ${toneClass(p.unrealizedPct)}`}>{pct(p.unrealizedPct)}</div>
                </div>
              </div>
            ))}
          </div>
          {agent && (
            <div className="mt-4 rounded-lg bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">
              Stocks: {agent.markets.stock ? "open" : "closed"} (NYSE 9:30–16:00 ET). Crypto: open 24/7.
            </div>
          )}
        </Card>

        <Card title="Latest headlines" right={<button onClick={() => onNavigate("news")} className="text-xs text-emerald-400 hover:underline">All news →</button>}>
          <div className="space-y-3">
            {news.length === 0 && <div className="text-sm text-slate-500">Loading headlines…</div>}
            {news.map((n) => (
              <div key={n.id}>
                <div className="line-clamp-2 text-xs leading-snug text-slate-200">{n.title}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {n.source} · {timeAgo(n.publishedAt)} ·{" "}
                  <span className={toneClass(n.sentiment)}>{n.sentiment > 0.2 ? "bullish" : n.sentiment < -0.2 ? "bearish" : "neutral"}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
