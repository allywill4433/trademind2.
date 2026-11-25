"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, api, inputClass, usd } from "./ui";
import type { BrokerName, TradingConfig } from "@/lib/settings";

type Brokers = Record<
  BrokerName,
  { label: string; configured: boolean; supports: string[]; env: string[] }
>;

type SettingsData = {
  config: TradingConfig;
  brokers: Brokers;
  liveTradingEnabled: boolean;
  alpacaPaper: boolean;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-700"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-4" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

export default function SettingsPanel({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<TradingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [resetLearning, setResetLearning] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function load() {
    try {
      const d = await api<SettingsData>("/api/settings");
      setData(d);
      setForm(d.config);
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "Failed to load settings" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!data || !form) {
    return <Card>{notice ? <div className="text-sm text-rose-400">{notice.text}</div> : <div className="text-sm text-slate-500">Loading settings…</div>}</Card>;
  }

  const set = <K extends keyof TradingConfig>(key: K, value: TradingConfig[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const num = (key: keyof TradingConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, Number(e.target.value) as never);

  async function save() {
    if (!form) return;
    if (form.mode === "live" && data?.config.mode !== "live") {
      if (!confirm("Switch to LIVE mode? The agent and the order ticket will place REAL orders with your broker.")) return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await api<{ config: TradingConfig; warnings: string[] }>("/api/settings", form);
      setWarnings(res.warnings ?? []);
      setNotice({ ok: true, text: "Settings saved" });
      await load();
      onSaved?.();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function resetPaper() {
    if (!confirm(`Reset the paper account to ${usd(form?.startingCash ?? 0, 0)}? All paper positions and orders are deleted.`)) return;
    setSaving(true);
    try {
      await api("/api/settings", { action: "resetPaper", resetLearning });
      setNotice({ ok: true, text: `Paper account reset${resetLearning ? " and AI memory cleared" : ""}` });
      onSaved?.();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "Reset failed" });
    } finally {
      setSaving(false);
    }
  }

  async function testBroker(broker: BrokerName) {
    setTestResult((r) => ({ ...r, [broker]: "Testing…" }));
    try {
      const res = await api<{ account: { cash: number; equity: number | null }; positions: number; broker: string }>(
        "/api/settings",
        { action: "testBroker", broker },
      );
      setTestResult((r) => ({
        ...r,
        [broker]: `Connected to ${res.broker}. Cash ${usd(res.account.cash)} · ${res.positions} holding(s).`,
      }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [broker]: e instanceof Error ? e.message : "Connection failed" }));
    }
  }

  const modeIsLive = form.mode === "live";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card
          title="Trading mode & controls"
          right={<Badge color={modeIsLive ? "red" : "green"}>{modeIsLive ? "LIVE · real money" : "PAPER · fake money"}</Badge>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Mode" hint="Paper uses simulated fills with fees and slippage. Live sends real orders to your broker.">
              <select className={inputClass} value={form.mode} onChange={(e) => set("mode", e.target.value as "paper" | "live")}>
                <option value="paper">Paper (fake money)</option>
                <option value="live">Live (real broker)</option>
              </select>
            </Field>
            <Field label="Live broker" hint="Robinhood's official API covers crypto only. Alpaca covers stocks and crypto.">
              <select
                className={inputClass}
                value={form.liveBroker}
                onChange={(e) => set("liveBroker", e.target.value as BrokerName)}
              >
                <option value="alpaca">Alpaca (stocks + crypto)</option>
                <option value="robinhood">Robinhood Crypto (crypto only)</option>
              </select>
            </Field>
            <Toggle label="Agent trading enabled" checked={form.agentEnabled} onChange={(v) => set("agentEnabled", v)} />
            <Toggle label="Kill switch (block new buys)" checked={form.killSwitch} onChange={(v) => set("killSwitch", v)} />
            <Toggle label="News filter (skip buys on bad headlines)" checked={form.newsFilter} onChange={(v) => set("newsFilter", v)} />
          </div>
          {!data.liveTradingEnabled && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              Live orders are locked. To enable them, add <code className="text-amber-100">LIVE_TRADING_ENABLED=true</code>{" "}
              to .env and restart the server. Until then, live mode sends nothing to your broker.
            </div>
          )}
          {warnings.map((w) => (
            <div key={w} className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              {w}
            </div>
          ))}
        </Card>

        <Card title="Risk management">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Risk per trade (% of equity lost if stop hits)" hint="0.1 – 5%">
              <input className={inputClass} type="number" step="0.1" value={form.riskPerTradePct} onChange={num("riskPerTradePct")} />
            </Field>
            <Field label="Max position size (% of equity)" hint="1 – 50%">
              <input className={inputClass} type="number" step="1" value={form.maxPositionPct} onChange={num("maxPositionPct")} />
            </Field>
            <Field label="Daily loss limit (%)" hint="Halts new entries for the rest of the UTC day">
              <input className={inputClass} type="number" step="0.5" value={form.dailyLossLimitPct} onChange={num("dailyLossLimitPct")} />
            </Field>
            <Field label="Weekly loss limit (%)" hint="Halts new entries after this weekly drawdown">
              <input className={inputClass} type="number" step="1" value={form.weeklyLossLimitPct} onChange={num("weeklyLossLimitPct")} />
            </Field>
            <Field label="Total drawdown halt (%)" hint="Stops all new entries after this drawdown from peak equity">
              <input className={inputClass} type="number" step="1" value={form.maxTotalDrawdownPct} onChange={num("maxTotalDrawdownPct")} />
            </Field>
            <Field label="Max capital allocation, live (%)" hint="Live mode only: max % of broker equity to deploy">
              <input className={inputClass} type="number" step="1" value={form.maxCapitalAllocationPct} onChange={num("maxCapitalAllocationPct")} />
            </Field>
            <Field label="Max per trade, live (USD)" hint="Live mode only: 0 = no cap">
              <input className={inputClass} type="number" step="1" value={form.maxPerTradeUsd} onChange={num("maxPerTradeUsd")} />
            </Field>
            <Field label="Approved assets (comma-separated)" hint="Empty = all. e.g. BTC-USD, ETH-USD, SPY">
              <input className={inputClass} type="text" value={form.approvedAssets} onChange={(e) => set("approvedAssets", e.target.value)} />
            </Field>
            <Field label="Max open positions" hint="1 – 20">
              <input className={inputClass} type="number" step="1" value={form.maxOpenPositions} onChange={num("maxOpenPositions")} />
            </Field>
            <Field label="Minimum signal confidence" hint="0.30 – 0.95">
              <input className={inputClass} type="number" step="0.05" value={form.minConfidence} onChange={num("minConfidence")} />
            </Field>
            <Field label="Stop-loss distance (× ATR)" hint="Stops trail upward as price rises">
              <input className={inputClass} type="number" step="0.25" value={form.stopAtrMult} onChange={num("stopAtrMult")} />
            </Field>
            <Field label="Take-profit distance (× ATR)" hint="Where the agent banks gains">
              <input className={inputClass} type="number" step="0.25" value={form.targetAtrMult} onChange={num("targetAtrMult")} />
            </Field>
            <Field label="Starting cash for paper account (USD)" hint="Applied when you reset the paper account">
              <input className={inputClass} type="number" step="1" value={form.startingCash} onChange={num("startingCash")} />
            </Field>
          </div>
        </Card>

        <Card title="Fees & slippage (paper simulation)">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Crypto fee (%)"><input className={inputClass} type="number" step="0.05" value={form.cryptoFeePct} onChange={num("cryptoFeePct")} /></Field>
            <Field label="Stock fee (%)"><input className={inputClass} type="number" step="0.05" value={form.stockFeePct} onChange={num("stockFeePct")} /></Field>
            <Field label="Slippage (%)"><input className={inputClass} type="number" step="0.01" value={form.slippagePct} onChange={num("slippagePct")} /></Field>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {notice && <span className={`text-sm ${notice.ok ? "text-emerald-300" : "text-rose-300"}`}>{notice.text}</span>}
        </div>
      </div>

      <div className="space-y-4">
        <Card title="Broker connections">
          <div className="space-y-3">
            {(Object.keys(data.brokers) as BrokerName[]).map((name) => {
              const b = data.brokers[name];
              return (
                <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-200">{b.label}</div>
                    <Badge color={b.configured ? "green" : "slate"}>{b.configured ? "Keys found" : "Not set up"}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">Supports: {b.supports.join(", ")}</div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Add to .env:{" "}
                    {b.env.map((k) => (
                      <code key={k} className="mr-1 rounded bg-slate-800 px-1 py-0.5 text-slate-300">
                        {k}
                      </code>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button disabled={!b.configured} onClick={() => testBroker(name)}>
                      Test connection
                    </Button>
                  </div>
                  {testResult[name] && <div className="mt-2 text-xs text-slate-300">{testResult[name]}</div>}
                </div>
              );
            })}
            <div className="text-[11px] text-slate-500">
              Alpaca uses its paper host unless ALPACA_PAPER=false. Robinhood keys are created in Robinhood&apos;s API
              credentials portal and need a base64 Ed25519 private key.
            </div>
          </div>
        </Card>

        <Card title="Reset paper account">
          <p className="mb-3 text-xs text-slate-400">
            Start the fake-money account over. This deletes paper positions, orders, and equity history.
          </p>
          <label className="mb-3 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={resetLearning} onChange={(e) => setResetLearning(e.target.checked)} />
            Also wipe the AI&apos;s learned memory (start from zero)
          </label>
          <Button variant="danger" disabled={saving} onClick={resetPaper}>
            Reset paper account
          </Button>
        </Card>

        <Card title="Get this on your iPhone">
          <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-slate-400">
            <li>Deploy to Railway (always-on). Do not use the sandbox e2b.app URL — phones are blocked there.</li>
            <li>Open your public https:// URL in <span className="text-slate-200">Safari</span>.</li>
            <li>Tap Share → Add to Home Screen.</li>
            <li>The AI keeps trading on the server even if the phone is locked.</li>
          </ol>
          <p className="mt-2 text-[11px] text-slate-500">Full click-by-click steps are in DEPLOY.md in the project.</p>
        </Card>

        <Card title="Safety rules built in">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>• Paper mode is the default. Live orders need the mode switch and LIVE_TRADING_ENABLED=true.</li>
            <li>• The kill switch blocks new buys. Stops and take-profits keep protecting open positions.</li>
            <li>• Trades are long-only spot. The agent never shorts or uses margin.</li>
            <li>• Each trade risks a fixed slice of equity. The daily loss limit pauses new entries.</li>
            <li>• US stocks trade only during regular hours. Crypto runs 24/7.</li>
            <li>• Past results, including backtests and the AI&apos;s learned memory, do not guarantee future profit.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
