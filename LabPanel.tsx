"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Stat, api, clock, inputClass, pct, toneClass } from "./ui";
import { UNIVERSE, TIMEFRAMES, type Timeframe } from "@/lib/market/universe";
import { STRATEGIES } from "@/lib/strategies";

type StrategyRow = {
  key: string;
  name: string;
  description: string;
  status: string;
  version: number;
  updatedAt: string;
};

type Experiment = {
  id: number;
  strategyKey: string;
  type: string;
  params: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  verdict: string | null;
  createdAt: string;
};

type MonteCarlo = {
  runs: number;
  median: number;
  mean: number;
  p10: number;
  p90: number;
  probTarget: number;
  probRuin: number;
  expectedValue: number;
  outcomes: number[];
};

type TenK = {
  startingCapital: number;
  target: number;
  tradeSample: number;
  avgWinPct: number;
  avgLossPct: number;
  winRate: number;
  theoretical: { tradesNeededAtAvgWin: number; note: string };
  profiles: Array<{ profile: { name: string; riskPerTradePct: number; description: string }; sim: MonteCarlo }>;
  verdict: string;
  ranAt: string;
};

type WalkForward = {
  folds: Array<{ fold: number; returnPct: number; trades: number; winRate: number }>;
  avgReturnPct: number;
  stability: string;
  verdict: string;
};

type Stress = { scenario: string; returnPct: number; maxDrawdownPct: number; trades: number; verdict: string };

function Histogram({ outcomes, target, height = 140 }: { outcomes: number[]; target: number; height?: number }) {
  if (!outcomes.length) return <div className="text-xs text-slate-500">No data</div>;
  const bins = 30;
  const max = Math.max(...outcomes, target);
  const counts = new Array<number>(bins).fill(0);
  for (const o of outcomes) {
    const idx = Math.min(bins - 1, Math.floor((o / max) * bins));
    counts[idx]++;
  }
  const peak = Math.max(...counts);
  const targetIdx = Math.min(bins - 1, Math.floor((target / max) * bins));
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {counts.map((c, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t ${i >= targetIdx ? "bg-emerald-500" : "bg-sky-600/70"}`}
            style={{ height: `${(c / peak) * 100}%` }}
            title={`${Math.round((i / bins) * max)}–${Math.round(((i + 1) / bins) * max)}: ${c} paths`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>$0</span>
        <span className="text-emerald-400">target ${target.toLocaleString()}</span>
        <span>${max.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function LabPanel() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("BTC-USD");
  const [tf, setTf] = useState<Timeframe>("5m");
  const [strategy, setStrategy] = useState("consensus");
  const [busy, setBusy] = useState<string | null>(null);
  const [mc, setMc] = useState<MonteCarlo | null>(null);
  const [wf, setWf] = useState<WalkForward | null>(null);
  const [stress, setStress] = useState<Stress | null>(null);
  const [stressScenario, setStressScenario] = useState("crash");

  const [tenK, setTenK] = useState<TenK | null>(null);
  const [tenKBusy, setTenKBusy] = useState(false);
  const [tenKError, setTenKError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ strategies: StrategyRow[]; experiments: Experiment[] }>("/api/lab");
      setStrategies(d.strategies);
      setExperiments(d.experiments);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab");
    }
  }, []);

  const loadTenK = useCallback(async () => {
    try {
      const d = await api<{ lastResult: TenK | null }>("/api/experiment10");
      setTenK(d.lastResult);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadTenK();
  }, [load, loadTenK]);

  async function run(action: string) {
    setBusy(action);
    setMc(null);
    setWf(null);
    setStress(null);
    try {
      const res = await api(action === "montecarlo" ? "/api/lab" : "/api/lab", {
        action,
        symbol,
        tf,
        strategy,
        runs: 1000,
        scenario: stressScenario,
      });
      if (action === "montecarlo") setMc(res as MonteCarlo);
      if (action === "walkforward") setWf(res as WalkForward);
      if (action === "stress") setStress(res as Stress);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Experiment failed");
    } finally {
      setBusy(null);
    }
  }

  async function runTenK() {
    setTenKBusy(true);
    setTenKError(null);
    try {
      const res = await api<TenK>("/api/experiment10", { runs: 1000 });
      setTenK(res);
    } catch (e) {
      setTenKError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setTenKBusy(false);
    }
  }

  async function setStrategyStatus(key: string, action: "approveStrategy" | "rejectStrategy") {
    setBusy(action + key);
    try {
      await api("/api/lab", { action, key });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  const strategyName = (key: string) =>
    key === "consensus" ? "Consensus" : STRATEGIES.find((s) => s.id === key)?.name ?? key;

  return (
    <div className="space-y-4">
      <Card
        title="$10 → $1,000 experiment"
        right={
          <Button variant="primary" disabled={tenKBusy} onClick={runTenK}>
            {tenKBusy ? "Simulating…" : "Run 1,000 Monte Carlo simulations"}
          </Button>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          The system tests whether any strategy can realistically grow $10 toward $1,000. It bootstraps real backtest
          trades into thousands of simulated paths with realistic fees, and reports the probability of reaching the
          target <span className="text-slate-200">and</span> the probability of ruin. The goal is treated as a research
          question, not a promise.
        </p>
        {tenKError && <div className="mb-2 text-xs text-rose-400">{tenKError}</div>}
        {!tenK && !tenKError && (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            No simulation yet. Run one to see the honest odds.
          </div>
        )}
        {tenK && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <Stat label="Trade sample" value={tenK.tradeSample} sub="real backtest trades" />
              <Stat label="Win rate" value={`${tenK.winRate.toFixed(0)}%`} />
              <Stat label="Avg win" value={pct(tenK.avgWinPct)} tone="text-emerald-300" />
              <Stat label="Avg loss" value={pct(tenK.avgLossPct)} tone="text-rose-300" />
              <Stat label="Trades needed (perfect)" value={tenK.theoretical.tradesNeededAtAvgWin} sub="if every trade won" />
              <Stat label="Simulated" value={clock(tenK.ranAt)} sub="last run" />
            </div>
            <div className="rounded-lg bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-300">{tenK.theoretical.note}</div>
            <div className="grid gap-3 lg:grid-cols-3">
              {tenK.profiles.map(({ profile, sim }) => (
                <div key={profile.name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100">{profile.name}</span>
                    <Badge color={profile.name === "Aggressive" ? "red" : profile.name === "Moderate" ? "amber" : "green"}>
                      {profile.riskPerTradePct}% risk
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{profile.description}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>Median: <span className="text-slate-100">${sim.median.toFixed(2)}</span></div>
                    <div>Expected: <span className="text-slate-100">${sim.expectedValue.toFixed(2)}</span></div>
                    <div>Reach $1,000: <span className="text-emerald-300">{(sim.probTarget * 100).toFixed(1)}%</span></div>
                    <div>Ruin: <span className="text-rose-300">{(sim.probRuin * 100).toFixed(1)}%</span></div>
                    <div>P10: <span className="text-slate-100">${sim.p10.toFixed(2)}</span></div>
                    <div>P90: <span className="text-slate-100">${sim.p90.toFixed(2)}</span></div>
                  </div>
                  <div className="mt-3">
                    <Histogram outcomes={sim.outcomes} target={1000} />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-300">{tenK.verdict}</div>
          </div>
        )}
      </Card>

      <Card title="Run an experiment">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
          <select className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {UNIVERSE.map((a) => (
              <option key={a.symbol} value={a.symbol}>{a.symbol} · {a.name}</option>
            ))}
          </select>
          <select className={inputClass} value={tf} onChange={(e) => setTf(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t}>{t} candles</option>
            ))}
          </select>
          <select className={inputClass} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="consensus">Consensus (2+ strategies agree)</option>
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy !== null} onClick={() => run("walkforward")}>
              {busy === "walkforward" ? "Running…" : "Walk-forward"}
            </Button>
            <Button disabled={busy !== null} onClick={() => run("montecarlo")}>
              {busy === "montecarlo" ? "Running…" : "Monte Carlo"}
            </Button>
            <select className={inputClass} value={stressScenario} onChange={(e) => setStressScenario(e.target.value)} style={{ width: 150 }}>
              <option value="crash">Crash −30%</option>
              <option value="flashcrash">Flash crash</option>
              <option value="volatility">Volatility spike</option>
              <option value="rally">Rally +25%</option>
              <option value="lowliquidity">Low liquidity</option>
            </select>
            <Button disabled={busy !== null} onClick={() => run("stress")}>
              {busy === "stress" ? "Running…" : "Stress test"}
            </Button>
          </div>
        </div>
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}

        {wf && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-100">Walk-forward result</span>
              <Badge color={wf.stability === "stable" ? "green" : wf.stability === "unstable" ? "amber" : "red"}>{wf.stability}</Badge>
              <span className="text-xs text-slate-400">avg fold return {pct(wf.avgReturnPct)}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {wf.folds.map((f) => (
                <div key={f.fold} className="rounded-lg bg-slate-900 p-2 text-xs">
                  <div className="text-slate-500">Fold {f.fold}</div>
                  <div className={`text-base font-semibold ${toneClass(f.returnPct)}`}>{pct(f.returnPct)}</div>
                  <div className="text-slate-500">{f.trades} trades · {f.winRate.toFixed(0)}% win</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-400">{wf.verdict}</div>
          </div>
        )}

        {mc && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 text-sm font-medium text-slate-100">Monte Carlo ({mc.runs.toLocaleString()} paths from $1,000)</div>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div>Median: <span className="text-slate-100">${mc.median.toFixed(0)}</span></div>
              <div>Expected: <span className="text-slate-100">${mc.expectedValue.toFixed(0)}</span></div>
              <div>Ruin: <span className="text-rose-300">{(mc.probRuin * 100).toFixed(1)}%</span></div>
              <div>Reach $100k: <span className="text-emerald-300">{(mc.probTarget * 100).toFixed(1)}%</span></div>
            </div>
            <div className="mt-3">
              <Histogram outcomes={mc.outcomes} target={100000} />
            </div>
          </div>
        )}

        {stress && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-1 text-sm font-medium text-slate-100">Stress test: {stress.scenario}</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>Return: <span className={toneClass(stress.returnPct)}>{pct(stress.returnPct)}</span></div>
              <div>Max drawdown: <span className="text-rose-300">{stress.maxDrawdownPct.toFixed(1)}%</span></div>
              <div>Trades: <span className="text-slate-100">{stress.trades}</span></div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{stress.verdict}</div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Strategy registry">
          <div className="space-y-2">
            {strategies.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{s.name}</span>
                    <Badge color={s.status === "approved" ? "green" : s.status === "rejected" ? "red" : s.status === "paper" ? "sky" : "amber"}>
                      {s.status}
                    </Badge>
                    <span className="text-[11px] text-slate-500">v{s.version}</span>
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{s.description}</div>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setStrategyStatus(s.key, "approveStrategy")}>
                    Approve
                  </Button>
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setStrategyStatus(s.key, "rejectStrategy")}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Experiment history (never deleted)">
          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {experiments.length === 0 && <div className="text-sm text-slate-500">No experiments yet.</div>}
            {experiments.map((e) => (
              <div key={e.id} className="rounded-lg bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200">
                    {strategyName(e.strategyKey)} · {e.type}
                  </span>
                  <span className="text-[11px] text-slate-500">{clock(e.createdAt)}</span>
                </div>
                {e.verdict && <div className="mt-1 text-[11px] leading-snug text-slate-400">{e.verdict}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
