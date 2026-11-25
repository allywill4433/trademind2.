"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type ChartBar = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type ChartPoint = { time: number; value: number };

const OVERLAY_COLORS: Record<string, string> = {
  ema12: "#38bdf8",
  ema26: "#f59e0b",
  ema50: "#a78bfa",
  bbUpper: "#64748b",
  bbLower: "#64748b",
};

type Refs = {
  candle?: ISeriesApi<"Candlestick">;
  volume?: ISeriesApi<"Histogram">;
  lines: Record<string, ISeriesApi<"Line">>;
  fitted: boolean;
};

export default function CandleChart({
  bars,
  overlays,
}: {
  bars: ChartBar[];
  overlays: Record<string, ChartPoint[]>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const refs = useRef<Refs>({ lines: {}, fitted: false });

  // Create the chart once per mount (the parent remounts on symbol/timeframe change).
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8", fontSize: 11 },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;
    refs.current.candle = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    refs.current.volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    return () => {
      chart.remove();
      chartRef.current = null;
      refs.current = { lines: {}, fitted: false };
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const r = refs.current;
    if (!chart || !r.candle || !r.volume) return;

    r.candle.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    r.volume.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)",
      })),
    );

    for (const [name, points] of Object.entries(overlays)) {
      let line = r.lines[name];
      if (!line) {
        line = chart.addSeries(LineSeries, {
          color: OVERLAY_COLORS[name] ?? "#cbd5e1",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        r.lines[name] = line;
      }
      line.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    }

    if (!r.fitted && bars.length > 0) {
      chart.timeScale().fitContent();
      r.fitted = true;
    }
  }, [bars, overlays]);

  return <div ref={containerRef} className="h-full w-full" />;
}
