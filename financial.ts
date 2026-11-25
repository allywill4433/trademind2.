import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { equitySnapshots, financialSnapshots, orders, portfolios } from "@/db/schema";
import { getConfig, getPortfolio } from "@/lib/settings";

// Six-figure objective tracker: capital, net profit, expenses, estimated tax
// liability, annualized and risk-adjusted returns, drawdowns, consistency,
// and honest scenario projections. Hypothetical returns are always labelled
// as projections, never as actual profit.

export const TAX_RATE_ESTIMATE = 0.24; // short-term capital gains estimate — a planning figure, not tax advice

export type Financials = {
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

export async function computeFinancials(): Promise<Financials> {
  const cfg = await getConfig();
  const portfolio = await getPortfolio(cfg.mode);
  const posRows = await db.select().from(portfolios).where(eq(portfolios.id, portfolio.id)).limit(1);
  void posRows;

  const snaps = await db
    .select()
    .from(equitySnapshots)
    .where(eq(equitySnapshots.portfolioId, portfolio.id))
    .orderBy(asc(equitySnapshots.createdAt))
    .limit(5000);

  const equity = snaps.length ? snaps[snaps.length - 1].equity : portfolio.cash;
  const capitalInvested = portfolio.startingCash;

  const sellRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.portfolioId, portfolio.id), eq(orders.side, "sell")));
  const realizedPnl = sellRows.reduce((s, o) => s + (o.realizedPnl ?? 0), 0);
  const feesPaid = sellRows.reduce((s, o) => s + o.fee, 0);
  const netProfit = equity - capitalInvested;
  const taxEstimate = Math.max(0, realizedPnl) * TAX_RATE_ESTIMATE;

  // Annualized return from the equity curve.
  let annualizedReturnPct: number | null = null;
  if (snaps.length >= 2 && capitalInvested > 0) {
    const days = Math.max(1, (snaps[snaps.length - 1].createdAt.getTime() - snaps[0].createdAt.getTime()) / 86400000);
    const totalPct = (equity - capitalInvested) / capitalInvested;
    annualizedReturnPct = (Math.pow(1 + totalPct, 365 / days) - 1) * 100;
  }

  // Sharpe from daily equity returns.
  let sharpe: number | null = null;
  const daily: number[] = [];
  const byDay = new Map<string, number>();
  for (const s of snaps) byDay.set(s.createdAt.toISOString().slice(0, 10), s.equity);
  const dayKeys = [...byDay.keys()].sort();
  for (let i = 1; i < dayKeys.length; i++) {
    const prev = byDay.get(dayKeys[i - 1]) ?? 0;
    const cur = byDay.get(dayKeys[i]) ?? 0;
    if (prev > 0) daily.push((cur - prev) / prev);
  }
  if (daily.length >= 10) {
    const mean = daily.reduce((s, x) => s + x, 0) / daily.length;
    const sd = Math.sqrt(daily.reduce((s, x) => s + (x - mean) ** 2, 0) / daily.length);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(365) : null;
  }

  // Max drawdown + monthly consistency.
  let peak = 0;
  let maxDrawdownPct = 0;
  const monthReturns = new Map<string, number>();
  let prevMonthEquity: number | null = null;
  let prevMonthKey = "";
  for (const s of snaps) {
    peak = Math.max(peak, s.equity);
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - s.equity) / peak) * 100);
    const mk = s.createdAt.toISOString().slice(0, 7);
    if (mk !== prevMonthKey) {
      if (prevMonthEquity !== null && prevMonthEquity > 0) {
        monthReturns.set(prevMonthKey, ((s.equity - prevMonthEquity) / prevMonthEquity) * 100);
      }
      prevMonthKey = mk;
      prevMonthEquity = s.equity;
    }
  }
  const positiveMonthsPct =
    monthReturns.size > 0
      ? ([...monthReturns.values()].filter((r) => r > 0).length / monthReturns.size) * 100
      : null;

  // Projections: capital needed for $100k/year at various returns, and years
  // to reach it from current equity at the measured annualized return.
  const projections = [5, 10, 20, 30].map((r) => {
    const capitalFor100kIncome = 100000 / (r / 100);
    let yearsToReachFromCurrent: number | null = null;
    if (annualizedReturnPct !== null && annualizedReturnPct > 0 && equity > 0) {
      yearsToReachFromCurrent =
        Math.log(capitalFor100kIncome / equity) / Math.log(1 + annualizedReturnPct / 100);
    }
    return { annualReturnPct: r, capitalFor100kIncome, yearsToReachFromCurrent };
  });

  return {
    mode: cfg.mode,
    capitalInvested,
    equity,
    netProfit,
    realizedPnl,
    unrealizedPnl: netProfit - realizedPnl,
    feesPaid,
    taxEstimate,
    annualizedReturnPct,
    sharpe,
    maxDrawdownPct,
    positiveMonthsPct,
    snapshots: snaps.length,
    projections,
    note: `Tax estimate uses a ${TAX_RATE_ESTIMATE * 100}% short-term rate for planning only — not tax advice. Projections are hypothetical scenarios, not actual profits.`,
  };
}

export async function recordDailySnapshot(): Promise<void> {
  const f = await computeFinancials();
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(financialSnapshots)
    .values({
      date: today,
      equity: f.equity,
      realizedPnl: f.realizedPnl,
      fees: f.feesPaid,
      taxEstimate: f.taxEstimate,
      annualizedReturn: f.annualizedReturnPct,
      sharpe: f.sharpe,
      maxDrawdown: f.maxDrawdownPct,
    })
    .onConflictDoUpdate({
      target: financialSnapshots.date,
      set: {
        equity: f.equity,
        realizedPnl: f.realizedPnl,
        fees: f.feesPaid,
        taxEstimate: f.taxEstimate,
        annualizedReturn: f.annualizedReturnPct,
        sharpe: f.sharpe,
        maxDrawdown: f.maxDrawdownPct,
      },
    });
}

export async function getFinancialHistory() {
  return db.select().from(financialSnapshots).orderBy(desc(financialSnapshots.date)).limit(180);
}
