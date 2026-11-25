"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EquityChart, Stat, api, clock, pct, price, toneClass, usd } from "./ui";

type Position = {
  symbol: string;
  assetClass: "stock" | "crypto";
  qty: number;
  avgPrice: number;
  price: number;
  value: number;
  cost: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  stopPrice: number | null;
  targetPrice: number | null;
  strategy: string | null;
  regime: string | null;
  openedAt: string;
};

type Order = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  notional: number;
  fee: number;
  status: string;
  source: string;
  strategy: string | null;
  reason: string | null;
  realizedPnlPct: number | null;
  createdAt: string;
};

type PortfolioData = {
  mode: "paper" | "live";
  portfolio: { name: string; startingCash: number; cash: number };
  equity: number;
  positionsValue: number;
  totalReturnPct: number;
  dayPnl: number;
  dayPnlPct: number;
  unrealizedPnl: number;
  realizedPnl: number;
  feesPaid: number;
  closedTrades: number;
  winRate: number | null;
  maxDrawdownPct: number;
  positions: Position[];
  orders: Order[];
  equityCurve: { time: number; equity: number }[];
};

export default function PortfolioPanel() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<PortfolioData>("/api/portfolio"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function sellAll(symbol: string) {
    if (!confirm(`Sell your entire ${symbol} position?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/trade", { side: "sell", symbol, all: true });
      setNotice(`Sold ${symbol}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sell failed");
    } finally {
      setBusy(false);
    }
  }

  async function flatten() {
    if (!confirm("Close ALL open positions now?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ results: Array<{ symbol: string; skipped?: string }> }>("/api/trade", { action: "flatten" });
      const skipped = res.results.filter((r) => r.skipped).map((r) => r.symbol);
      setNotice(
        skipped.length
          ? `Closed what could be closed. Skipped (market closed): ${skipped.join(", ")}`
          : "All positions closed",
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Flatten failed");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <Card>{error ? <div className="text-sm text-rose-400">{error}</div> : <div className="text-sm text-slate-500">Loading portfolio…</div>}</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Equity" value={usd(data.equity)} sub={data.mode === "paper" ? "fake money" : "broker mirror"} />
        <Stat label="Cash" value={usd(data.portfolio.cash)} />
        <Stat label="Day P&L" value={usd(data.dayPnl)} sub={pct(data.dayPnlPct)} tone={toneClass(data.dayPnl)} />
        <Stat label="Total return" value={pct(data.totalReturnPct)} tone={toneClass(data.totalReturnPct)} />
        <Stat label="Realized P&L" value={usd(data.realizedPnl)} tone={toneClass(data.realizedPnl)} sub={`${usd(data.feesPaid)} fees`} />
        <Stat label="Unrealized" value={usd(data.unrealizedPnl)} tone={toneClass(data.unrealizedPnl)} />
        <Stat label="Win rate" value={data.winRate === null ? "—" : `${data.winRate.toFixed(0)}%`} sub={`${data.closedTrades} closed`} />
        <Stat label="Max drawdown" value={`-${data.maxDrawdownPct.toFixed(2)}%`} tone={data.maxDrawdownPct > 0 ? "text-rose-300" : ""} />
      </div>

      <Card
        title="Equity curve"
        right={
          <Button variant="danger" disabled={busy || data.positions.length === 0} onClick={flatten}>
            Close all positions
          </Button>
        }
      >
        <EquityChart points={data.equityCurve} height={200} />
        {notice && <div className="mt-2 text-xs text-slate-300">{notice}</div>}
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
      </Card>

      <Card title={`Open positions (${data.positions.length})`}>
        {data.positions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            No open positions. The agent will open positions when a strategy setup passes its risk checks.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg cost</th>
                  <th className="py-2 pr-3 text-right font-medium">Price</th>
                  <th className="py-2 pr-3 text-right font-medium">Value</th>
                  <th className="py-2 pr-3 text-right font-medium">P&amp;L</th>
                  <th className="py-2 pr-3 text-right font-medium">Stop / target</th>
                  <th className="py-2 pr-3 font-medium">Opened by</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.positions.map((p) => (
                  <tr key={p.symbol}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-slate-100">{p.symbol}</div>
                      <div className="text-[10px] uppercase text-slate-500">{p.assetClass}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.qty.toPrecision(5)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{price(p.avgPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{price(p.price)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{usd(p.value)}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${toneClass(p.unrealizedPnl)}`}>
                      {usd(p.unrealizedPnl)} <span className="text-[10px]">({pct(p.unrealizedPct)})</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">
                      {price(p.stopPrice)} / {price(p.targetPrice)}
                    </td>
                    <td className="py-2 pr-3">
                      {p.strategy ? (
                        <Badge color="violet">{p.strategy}</Badge>
                      ) : (
                        <Badge color="slate">manual</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" disabled={busy} onClick={() => sellAll(p.symbol)}>
                        Sell
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Order history">
        {data.orders.length === 0 ? (
          <div className="text-sm text-slate-500">No orders yet.</div>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Side</th>
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Price</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 text-right font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 pr-3 text-slate-400">{clock(o.createdAt)}</td>
                    <td className="py-1.5 pr-3">
                      <Badge color={o.side === "buy" ? "green" : "red"}>{o.side}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 font-medium text-slate-200">{o.symbol}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{o.qty.toPrecision(5)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{price(o.price)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usd(o.notional)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${toneClass(o.realizedPnlPct)}`}>
                      {o.realizedPnlPct === null ? "—" : pct(o.realizedPnlPct)}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400">{o.source}</td>
                    <td className="max-w-[320px] truncate py-1.5 text-slate-400">{o.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
