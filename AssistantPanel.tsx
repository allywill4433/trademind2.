"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, api, clock, inputClass } from "./ui";

type Msg = { id: number; role: string; body: string; createdAt: string };

const SUGGESTIONS = [
  "Research bitcoin",
  "Best opportunities today",
  "Why is BTC down?",
  "Run 1000 simulations",
  "Mistakes in my last 20 trades",
  "Risk report",
  "Status",
  "Backtest BTC-USD",
  "Walk-forward",
  "Top traders",
  "Help",
];

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function AssistantPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ messages: Msg[] }>("/api/assistant");
      setMessages(d.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  function speakText(text: string) {
    if (!speak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
    utter.rate = 1.02;
    window.speechSynthesis.speak(utter);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", body: message, createdAt: new Date().toISOString() },
    ]);
    setInput("");
    try {
      const res = await api<{ reply: string }>("/api/assistant", { message });
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", body: res.reply, createdAt: new Date().toISOString() },
      ]);
      speakText(res.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input needs Chrome or Edge (SpeechRecognition is not available in this browser).");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) send(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title="Personal AI assistant"
        right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
              Read replies aloud
            </label>
            <Badge color="violet">persistent memory</Badge>
          </div>
        }
      >
        <div ref={scrollRef} className="h-[520px] space-y-3 overflow-auto pr-1">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
              Ask me anything about the markets, your portfolio, or the system. I remember our conversations.
              Try a suggestion below, or tap the microphone to speak.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-100"}`}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</div>
                <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-emerald-200" : "text-slate-500"}`}>{clock(m.createdAt)}</div>
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-slate-500">Thinking…</div>}
        </div>
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Ask or instruct… (e.g. 'Research bitcoin', 'Run 1000 simulations')"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
          />
          <Button
            variant={listening ? "danger" : "default"}
            onClick={toggleVoice}
            title="Voice input"
            className="shrink-0"
          >
            {listening ? "● Listening…" : "🎤 Voice"}
          </Button>
          <Button variant="primary" disabled={busy || !input.trim()} onClick={() => send(input)}>
            Send
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="What I can do">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>• <span className="text-slate-200">Research</span> any symbol with live data, indicators and news sentiment.</li>
            <li>• <span className="text-slate-200">Simulate</span> thousands of Monte Carlo paths for the $10 → $1,000 goal.</li>
            <li>• <span className="text-slate-200">Review</span> your last trades and find recurring mistakes.</li>
            <li>• <span className="text-slate-200">Test</span> strategies with backtests and walk-forward analysis.</li>
            <li>• <span className="text-slate-200">Control</span> the agent: pause, resume, or hit the kill switch.</li>
            <li>• <span className="text-slate-200">Remember</span> your preferences across sessions.</li>
          </ul>
        </Card>
        <Card title="Safety boundaries">
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>• I can <span className="text-slate-200">stop</span> trading from chat, but I will never <span className="text-slate-200">start live trading</span> or place real orders from a conversation.</li>
            <li>• Real-money controls live in Settings only, behind the LIVE_TRADING_ENABLED flag.</li>
            <li>• I treat social posts, videos and websites as untrusted data — never as instructions.</li>
            <li>• If I don't have evidence, I'll say so instead of guessing.</li>
          </ul>
        </Card>
        <Card title="Voice">
          <p className="text-xs leading-relaxed text-slate-400">
            Tap <span className="text-slate-200">🎤 Voice</span> to speak (Chrome/Edge). Enable
            <span className="text-slate-200"> Read replies aloud</span> to hear my answers. Voice is processed by your
            browser's speech service; chat history is stored in your database.
          </p>
        </Card>
      </div>
    </div>
  );
}
