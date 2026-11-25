import { UNIVERSE } from "@/lib/market/universe";

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  sentiment: number; // -1 (very bearish) .. +1 (very bullish)
  symbols: string[];
};

const FEEDS: { name: string; url: string }[] = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=stock+market+OR+wall+street+OR+bitcoin+when:2d&hl=en-US&gl=US&ceid=US:en",
  },
  ...["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "BTC-USD"].map((s) => ({
    name: `Yahoo ${s}`,
    url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s}&region=US&lang=en-US`,
  })),
];

const POSITIVE = [
  "surge", "soar", "rally", "gain", "jump", "record", "beat", "upgrade", "bullish", "growth",
  "profit", "rise", "approve", "approval", "win", "strong", "boost", "all-time high", "buy",
  "optimism", "breakout", "adoption", "inflow", "partnership", "launch", "rebound",
];
const NEGATIVE = [
  "plunge", "crash", "fall", "drop", "slump", "lawsuit", "ban", "hack", "miss", "downgrade",
  "bearish", "loss", "weak", "sell-off", "selloff", "fraud", "probe", "cut", "risk", "warning",
  "decline", "layoff", "outflow", "liquidation", "fear", "tumble", "sink", "recession", "exploit",
];

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; items: NewsItem[] } | null = null;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

function parseRss(xml: string, feedName: string): Array<Omit<NewsItem, "sentiment" | "symbols">> {
  const out: Array<Omit<NewsItem, "sentiment" | "symbols">> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = tag(block, "title");
    if (!title) continue;
    const link = tag(block, "link");
    const pub = tag(block, "pubDate");
    const parsed = pub ? new Date(pub) : new Date();
    out.push({
      id: link || title,
      title,
      link,
      source: tag(block, "source") || feedName,
      publishedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    });
    if (out.length >= 25) break;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scoreSentiment(text: string): number {
  const t = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (new RegExp(`\\b${escapeRegex(w)}`).test(t)) pos++;
  for (const w of NEGATIVE) if (new RegExp(`\\b${escapeRegex(w)}`).test(t)) neg++;
  return (pos - neg) / (pos + neg + 1);
}

export function matchSymbols(text: string): string[] {
  const t = text.toLowerCase();
  return UNIVERSE.filter((a) =>
    a.keywords.some((k) => new RegExp(`\\b${escapeRegex(k.toLowerCase())}\\b`).test(t)),
  ).map((a) => a.symbol);
}

async function fetchFeed(name: string, url: string): Promise<Array<Omit<NewsItem, "sentiment" | "symbols">>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradeMindAI/1.0)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return parseRss(await res.text(), name);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function getNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.name, f.url)));
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const raw of results.flat()) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    items.push({
      ...raw,
      sentiment: scoreSentiment(raw.title),
      symbols: matchSymbols(raw.title),
    });
  }
  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const limited = items.slice(0, 120);
  // Keep the last good result if every feed failed this time.
  if (limited.length > 0 || !cache) cache = { at: Date.now(), items: limited };
  return cache.items;
}

// Average sentiment of the last 24h of headlines that mention a symbol.
export async function getSymbolSentiment(symbol: string): Promise<number> {
  const items = await getNews();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const relevant = items.filter((i) => i.symbols.includes(symbol) && new Date(i.publishedAt).getTime() >= cutoff);
  if (relevant.length === 0) return 0;
  return relevant.reduce((sum, i) => sum + i.sentiment, 0) / relevant.length;
}
