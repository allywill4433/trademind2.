"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EquityChart, Stat, api, pct, toneClass, usd } from "./ui";

type Financials = {
  mode: string;
  capitalInvested: number;
  equity: number;
  netProfit: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  taxEstimate: number;
  annualizedReturnPct: number | null;
  sharpe: number | null;
  maxDrawdownPct: number;
  positiveMonthsPct: number | null;
  snapshots: number;
  projections: Array<{
    annualReturnPct: number;
    capitalFor100kIncome: number;
    yearsToReachFromCurrent: number | null;
  }>;
  note: string;
};

type HistoryRow = {
  date: string;
  equity: number;
  realizedPnl: number;
  fees: number;
  taxEstimate: number;
  annualizedReturn: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
};

export default function FinancialPanel() {
  const [data, setData] = useState<{ financials: Financials; history: HistoryRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/financial"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load financials");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function snapshot() {
    setBusy(true);
    try {
      await api("/api/financial", { action: "snapshot" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <Card>{error ? <div className="text-sm text-rose-400">{error}</div> : <div className="text-sm text-slate-500">Loading financial tracker…</div>}</Card>;
  }

  const f = data.financials;
  const curve = [...data.history].reverse().map((h, i) => ({ time: i, equity: h.equity }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Capital invested" value={usd(f.capitalInvested)} sub={f.mode} />
        <Stat label="Equity" value={usd(f.equity)} />
        <Stat label="Net profit" value={usd(f.netProfit)} tone={toneClass(f.netProfit)} />
        <Stat label="Realized P&L" value={usd(f.realizedPnl)} tone={toneClass(f.realizedPnl)} />
        <Stat label="Fees paid" value={usd(f.feesPaid)} tone="text-rose-300" />
        <Stat label="Est. tax liability" value={usd(f.taxEstimate)} sub="planning estimate" />
        <Stat label="Annualized return" value={f.annualizedReturnPct === null ? "—" : pct(f.annualizedReturnPct)} tone={toneClass(f.annualizedReturnPct)} />
        <Stat label="Sharpe ratio" value={f.sharpe === null ? "—" : f.sharpe.toFixed(2)} sub="needs 10+ days of data" />
        <Stat label="Max drawdown" value={`-${f.maxDrawdownPct.toFixed(1)}%`} tone={f.maxDrawdownPct > 0 ? "text-rose-300" : ""} />
        <Stat label="Positive months" value={f.positiveMonthsPct === null ? "—" : `${f.positiveMonthsPct.toFixed(0)}%`} sub="consistency" />
        <Stat label="Data points" value={f.snapshots} sub="equity snapshots" />
        <Stat label="Unrealized P&L" value={usd(f.unrealizedPnl)} tone={toneClass(f.unrealizedPnl)} />
      </div>

      <Card
        title="Equity history (daily snapshots)"
        right={
          <Button disabled={busy} onClick={snapshot}>
            Record today's snapshot
          </Button>
        }
      >
        <EquityChart points={curve} height={200} empty="Record a snapshot to start the history. The system also records one automatically each day." />
      </Card>

      <Card title="Six-figure income scenarios (hypothetical — not actual profits)">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          What would it take to earn $100,000/year from trading? The table shows the capital required at different
          sustained annual returns, and how long it would take to reach that capital from your current equity at your
          measured annualized return. These are scenarios for planning, not predictions.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Sustained annual return</th>
                <th className="py-2 pr-3 text-right font-medium">Capital needed for $100k/yr</th>
                <th className="py-2 text-right font-medium">Years from current equity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {f.projections.map((p) => (
                <tr key={p.annualReturnPct}>
                  <td className="py-2 pr-3 text-slate-200">{p.annualReturnPct}%</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{usd(p.capitalFor100kIncome, 0)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {p.yearsToReachFromCurrent === null
                      ? "needs a positive measured return first"
                      : `${p.yearsToReachFromCurrent.toFixed(1)} years`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-500">{f.note}</div>
      </Card>
    </div>
  );
}
