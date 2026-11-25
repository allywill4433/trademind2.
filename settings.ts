import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, portfolios } from "@/db/schema";

export type BrokerName = "alpaca" | "robinhood";
export type TradingMode = "paper" | "live";

export type TradingConfig = {
  mode: TradingMode;
  agentEnabled: boolean;
  killSwitch: boolean;
  startingCash: number;
  riskPerTradePct: number; // % of equity you are willing to lose on one trade
  maxPositionPct: number; // max % of equity in one position
  dailyLossLimitPct: number; // stop opening new trades after this daily drawdown
  weeklyLossLimitPct: number; // stop opening new trades after this weekly drawdown
  maxTotalDrawdownPct: number; // halt trading after this drawdown from peak equity
  maxCapitalAllocationPct: number; // live mode: max % of broker equity to deploy
  maxPerTradeUsd: number; // live mode: max USD per single order (0 = no cap)
  approvedAssets: string; // comma-separated symbols the agent may trade (empty = all)
  maxOpenPositions: number;
  minConfidence: number; // minimum strategy confidence to consider a trade
  stopAtrMult: number; // stop-loss distance in ATRs
  targetAtrMult: number; // take-profit distance in ATRs
  newsFilter: boolean; // block buys when recent headlines are strongly negative
  liveBroker: BrokerName;
  cryptoFeePct: number;
  stockFeePct: number;
  slippagePct: number;
};

export const DEFAULT_CONFIG: TradingConfig = {
  mode: "paper",
  agentEnabled: true,
  killSwitch: false,
  startingCash: 1000,
  riskPerTradePct: 1,
  maxPositionPct: 20,
  dailyLossLimitPct: 5,
  weeklyLossLimitPct: 10,
  maxTotalDrawdownPct: 25,
  maxCapitalAllocationPct: 50,
  maxPerTradeUsd: 0,
  approvedAssets: "",
  maxOpenPositions: 5,
  minConfidence: 0.55,
  stopAtrMult: 2,
  targetAtrMult: 3,
  newsFilter: true,
  liveBroker: "alpaca",
  cryptoFeePct: 0.6,
  stockFeePct: 0,
  slippagePct: 0.05,
};

type NumericKey = {
  [K in keyof TradingConfig]: TradingConfig[K] extends number ? K : never;
}[keyof TradingConfig];

const NUMERIC_RANGES: Record<NumericKey, [number, number]> = {
  startingCash: [1, 10_000_000],
  riskPerTradePct: [0.1, 5],
  maxPositionPct: [1, 50],
  dailyLossLimitPct: [0.5, 50],
  weeklyLossLimitPct: [1, 80],
  maxTotalDrawdownPct: [5, 90],
  maxCapitalAllocationPct: [1, 100],
  maxPerTradeUsd: [0, 10_000_000],
  maxOpenPositions: [1, 20],
  minConfidence: [0.3, 0.95],
  stopAtrMult: [0.5, 6],
  targetAtrMult: [0.5, 10],
  cryptoFeePct: [0, 2],
  stockFeePct: [0, 2],
  slippagePct: [0, 1],
};

export function sanitizeConfig(input: Partial<TradingConfig>, base: TradingConfig = DEFAULT_CONFIG): TradingConfig {
  const next: TradingConfig = { ...base };
  for (const [key, [min, max]] of Object.entries(NUMERIC_RANGES) as [NumericKey, [number, number]][]) {
    const raw = input[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) next[key] = Math.min(max, Math.max(min, n));
  }
  if (input.mode === "paper" || input.mode === "live") next.mode = input.mode;
  if (input.liveBroker === "alpaca" || input.liveBroker === "robinhood") next.liveBroker = input.liveBroker;
  if (typeof input.agentEnabled === "boolean") next.agentEnabled = input.agentEnabled;
  if (typeof input.killSwitch === "boolean") next.killSwitch = input.killSwitch;
  if (typeof input.newsFilter === "boolean") next.newsFilter = input.newsFilter;
  if (typeof input.approvedAssets === "string") next.approvedAssets = input.approvedAssets.slice(0, 500);
  return next;
}

export type Runtime = {
  dayKey?: string;
  dayStartEquity?: number;
  lastCycleAt?: string;
  lastCycleSummary?: string;
  lastError?: string;
  cycles?: number;
  haltLoggedDay?: string;
};

async function readSetting<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value: value as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: value as object, updatedAt: new Date() } });
}

export async function getConfig(): Promise<TradingConfig> {
  const stored = (await readSetting<Partial<TradingConfig>>("config")) ?? {};
  return sanitizeConfig(stored);
}

export async function saveConfig(patch: Partial<TradingConfig>): Promise<TradingConfig> {
  const current = await getConfig();
  const next = sanitizeConfig(patch, current);
  await writeSetting("config", next);
  return next;
}

export async function getRuntime(): Promise<Runtime> {
  return (await readSetting<Runtime>("runtime")) ?? {};
}

export async function setRuntime(patch: Partial<Runtime>): Promise<void> {
  const current = await getRuntime();
  await writeSetting("runtime", { ...current, ...patch });
}

let bootPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const cfg = await getConfig();
  const existing = await db.select({ mode: portfolios.mode }).from(portfolios);
  if (!existing.some((p) => p.mode === "paper")) {
    await db.insert(portfolios).values({
      name: "Paper account (fake money)",
      mode: "paper",
      startingCash: cfg.startingCash,
      cash: cfg.startingCash,
    });
  }
  if (!existing.some((p) => p.mode === "live")) {
    await db.insert(portfolios).values({ name: "Live account (broker)", mode: "live", startingCash: 0, cash: 0 });
  }
}

// Creates the default paper and live portfolios on first use.
export function ensureBootstrap(): Promise<void> {
  if (!bootPromise) {
    bootPromise = bootstrap().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}

export async function getPortfolio(mode: TradingMode) {
  await ensureBootstrap();
  const rows = await db.select().from(portfolios).where(eq(portfolios.mode, mode)).limit(1);
  if (!rows[0]) throw new Error(`No ${mode} portfolio found`);
  return rows[0];
}

// Real-money orders need both the UI switch (mode = live) and this env flag.
export function liveTradingEnabled(): boolean {
  return process.env.LIVE_TRADING_ENABLED === "true";
}
