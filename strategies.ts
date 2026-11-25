import type { Bar } from "./market/universe";
import type { Indicators } from "./market/indicators";

export type StrategyId = "ema_cross" | "rsi_reversion" | "bb_breakout" | "macd_momentum" | "pullback_trend";
export type Regime = "uptrend" | "downtrend" | "range";
export type Signal = { action: "buy" | "sell" | "hold"; confidence: number; reason: string };

export const STRATEGIES: { id: StrategyId; name: string; description: string }[] = [
  {
    id: "ema_cross",
    name: "EMA 12/26 Cross",
    description: "Buys when the fast EMA crosses above the slow EMA; sells on the reverse cross.",
  },
  {
    id: "rsi_reversion",
    name: "RSI Mean Reversion",
    description: "Buys oversold bounces (RSI < 32 turning up); exits when RSI > 68.",
  },
  {
    id: "bb_breakout",
    name: "Bollinger Breakout",
    description: "Buys closes above the upper band with positive MACD histogram; exits below the midline.",
  },
  {
    id: "macd_momentum",
    name: "MACD Momentum",
    description: "Buys MACD line crossing above its signal line; sells on the reverse cross.",
  },
  {
    id: "pullback_trend",
    name: "Trend Pullback",
    description: "Buys pullbacks to EMA 26 inside an uptrend once RSI turns up; exits below EMA 50.",
  },
];

export const STRATEGY_IDS = STRATEGIES.map((s) => s.id);

export function isStrategyId(value: string | null | undefined): value is StrategyId {
  return !!value && (STRATEGY_IDS as string[]).includes(value);
}

const HOLD: Signal = { action: "hold", confidence: 0, reason: "" };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const WARMUP = 55; // EMA50 needs ~50 bars before signals are trustworthy

export function detectRegime(bars: Bar[], ind: Indicators, i: number): Regime {
  if (i < 6) return "range";
  const e = ind.ema50;
  if (!Number.isFinite(e[i]) || !Number.isFinite(e[i - 5])) return "range";
  const close = bars[i].close;
  const slope = e[i] - e[i - 5];
  if (close > e[i] && slope > 0) return "uptrend";
  if (close < e[i] && slope < 0) return "downtrend";
  return "range";
}

export function evaluateStrategy(id: StrategyId, bars: Bar[], ind: Indicators, i: number): Signal {
  if (i < WARMUP) return HOLD;
  const c = bars[i].close;
  const cp = bars[i - 1].close;
  const volRatio = ind.volAvg20[i] > 0 ? bars[i].volume / ind.volAvg20[i] : 1;

  switch (id) {
    case "ema_cross": {
      const up = ind.ema12[i - 1] <= ind.ema26[i - 1] && ind.ema12[i] > ind.ema26[i];
      const down = ind.ema12[i - 1] >= ind.ema26[i - 1] && ind.ema12[i] < ind.ema26[i];
      if (up) {
        let conf = 0.6;
        if (c > ind.ema50[i]) conf += 0.15;
        if (ind.rsi14[i] < 70) conf += 0.1;
        return { action: "buy", confidence: clamp01(conf), reason: "EMA12 crossed above EMA26" };
      }
      if (down) return { action: "sell", confidence: 0.7, reason: "EMA12 crossed below EMA26" };
      return HOLD;
    }
    case "rsi_reversion": {
      const r = ind.rsi14[i];
      const rp = ind.rsi14[i - 1];
      if (r < 32 && r > rp && c > ind.bbLower[i]) {
        return {
          action: "buy",
          confidence: clamp01(0.5 + (32 - r) / 64),
          reason: `RSI ${r.toFixed(0)} turning up from oversold`,
        };
      }
      if (r > 68) return { action: "sell", confidence: 0.7, reason: `RSI ${r.toFixed(0)} overbought` };
      return HOLD;
    }
    case "bb_breakout": {
      const breakout = c > ind.bbUpper[i] && cp <= ind.bbUpper[i - 1];
      if (breakout && ind.macdHist[i] > 0) {
        const conf = 0.6 + (volRatio > 1.5 ? 0.2 : 0) + 0.1;
        return {
          action: "buy",
          confidence: clamp01(conf),
          reason: "Breakout above upper Bollinger band with positive MACD histogram",
        };
      }
      if (c < ind.bbMid[i] && cp >= ind.bbMid[i - 1]) {
        return { action: "sell", confidence: 0.6, reason: "Lost Bollinger midline" };
      }
      return HOLD;
    }
    case "macd_momentum": {
      const up = ind.macd[i - 1] <= ind.macdSignal[i - 1] && ind.macd[i] > ind.macdSignal[i];
      const down = ind.macd[i - 1] >= ind.macdSignal[i - 1] && ind.macd[i] < ind.macdSignal[i];
      if (up) {
        const conf = 0.6 + (c > ind.ema50[i] ? 0.2 : 0);
        return { action: "buy", confidence: clamp01(conf), reason: "MACD crossed above its signal line" };
      }
      if (down) return { action: "sell", confidence: 0.6, reason: "MACD crossed below its signal line" };
      return HOLD;
    }
    case "pullback_trend": {
      const trendUp = c > ind.ema50[i] && ind.ema50[i] > ind.ema50[i - 5];
      const r = ind.rsi14[i];
      const nearEma26 = Math.abs(c - ind.ema26[i]) / c < 0.005;
      if (trendUp && r >= 40 && r <= 52 && r > ind.rsi14[i - 1] && nearEma26) {
        return { action: "buy", confidence: 0.62, reason: "Pullback to EMA26 inside uptrend, RSI turning up" };
      }
      if (c < ind.ema50[i] && cp >= ind.ema50[i - 1]) {
        return { action: "sell", confidence: 0.7, reason: "Lost EMA50 trend support" };
      }
      return HOLD;
    }
  }
}

// Used by backtests: "consensus" buys when at least two strategies agree.
export function evaluateConsensus(bars: Bar[], ind: Indicators, i: number, minConfidence: number): Signal {
  let buys = 0;
  let sells = 0;
  const reasons: string[] = [];
  for (const s of STRATEGIES) {
    const sig = evaluateStrategy(s.id, bars, ind, i);
    if (sig.action === "buy" && sig.confidence >= minConfidence) {
      buys++;
      reasons.push(s.name);
    }
    if (sig.action === "sell" && sig.confidence >= 0.5) sells++;
  }
  if (buys >= 2) return { action: "buy", confidence: 0.5 + buys * 0.1, reason: `Consensus: ${reasons.join(", ")}` };
  if (sells >= 2) return { action: "sell", confidence: 0.6, reason: "Consensus exit" };
  return HOLD;
}
