import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ───────────────────────────────────────────────────────
interface OrderBookRow {
  price: number;
  volume: number;
  type: "ask" | "bid";
  highlight?: "large" | "xlarge";
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface Ticker {
  symbol: string;
  change: number;
  bid: number;
}

// ── Helpers ─────────────────────────────────────────────────────
const fmt = (n: number, d = 4) => n.toFixed(d);
const fmtK = (v: number) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toFixed(2);
};

// ── Binance WebSocket hooks ──────────────────────────────────────
const BINANCE_WS = "wss://stream.binance.com:9443/stream?streams=";

// Fetch initial REST snapshot for order book
async function fetchDepthSnapshot(symbol: string): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
  const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=20`);
  return res.json();
}

// Fetch klines (candles) from REST
async function fetchKlines(symbol: string, interval: string, limit = 60): Promise<Candle[]> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
  );
  const data: [number, string, string, string, string, string][] = await res.json();
  return data.map((k) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// Fetch 24h ticker for multiple symbols
async function fetch24hTickers(symbols: string[]): Promise<Ticker[]> {
  const syms = JSON.stringify(symbols.map((s) => `"${s.toUpperCase()}USDT"`));
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`);
  const data: { symbol: string; priceChangePercent: string; bidPrice: string }[] = await res.json();
  return data.map((t) => ({
    symbol: t.symbol.replace("USDT", ""),
    change: parseFloat(t.priceChangePercent),
    bid: parseFloat(t.bidPrice),
  }));
}

function parseBook(rows: [string, string][], type: "ask" | "bid"): OrderBookRow[] {
  return rows.slice(0, 18).map(([price, qty]) => {
    const volume = parseFloat(qty);
    return {
      price: parseFloat(price),
      volume,
      type,
      highlight: volume > 50 ? "xlarge" : volume > 15 ? "large" : undefined,
    };
  });
}

const TICKER_SYMBOLS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX",
  "LINK", "DOT", "MATIC", "LTC", "UNI", "ATOM", "APT",
  "ARB", "OP", "INJ", "SUI", "NEAR",
];

// ── Candlestick Chart ────────────────────────────────────────────
function CandleChart({ candles, pair }: { candles: Candle[]; pair: string }) {
  const W = 640, H = 330;
  const PAD = { top: 10, right: 72, bottom: 18, left: 6 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (!candles.length) return (
    <div className="flex items-center justify-center h-full text-[#333] text-[11px]">Загрузка данных...</div>
  );

  const visible = candles.slice(-55);
  const maxH = Math.max(...visible.map((c) => c.high));
  const minL = Math.min(...visible.map((c) => c.low));
  const range = maxH - minL || 1;

  const candleW = Math.max(2, Math.floor(chartW / visible.length) - 1);
  const toY = (v: number) => PAD.top + ((maxH - v) / range) * chartH;

  const priceStep = range / 6;
  const priceLines = Array.from({ length: 7 }, (_, i) => minL + priceStep * (6 - i));
  const lastClose = visible[visible.length - 1].close;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {priceLines.map((p, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(p)} x2={W - PAD.right} y2={toY(p)} stroke="#161616" strokeWidth="1" />
          <text x={W - PAD.right + 3} y={toY(p) + 4} fill="#444" fontSize="9" fontFamily="IBM Plex Mono">
            {p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(4)}
          </text>
        </g>
      ))}
      {visible.map((c, i) => {
        const x = PAD.left + i * (candleW + 1);
        const isGreen = c.close >= c.open;
        const color = isGreen ? "#00c864" : "#dc3232";
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
        const cx = x + candleW / 2;
        return (
          <g key={i}>
            <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={color} strokeWidth="1" />
            <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} opacity={0.9} />
          </g>
        );
      })}
      <line
        x1={PAD.left} y1={toY(lastClose)}
        x2={W - PAD.right} y2={toY(lastClose)}
        stroke="#0077cc" strokeWidth="1" strokeDasharray="3 3"
      />
      <rect x={W - PAD.right} y={toY(lastClose) - 8} width={PAD.right - 2} height={16} fill="#003366" />
      <text x={W - PAD.right + 3} y={toY(lastClose) + 4} fill="#00aaff" fontSize="9" fontFamily="IBM Plex Mono" fontWeight="600">
        {lastClose >= 1000 ? lastClose.toFixed(1) : lastClose >= 1 ? lastClose.toFixed(3) : lastClose.toFixed(5)}
      </text>
      <text x={PAD.left + 4} y={H - 4} fill="#333" fontSize="9" fontFamily="IBM Plex Mono">{pair}</text>
    </svg>
  );
}

// ── Order Book ───────────────────────────────────────────────────
function OrderBook({ rows, midPrice, symbol }: { rows: OrderBookRow[]; midPrice: number; symbol: string }) {
  const asks = rows.filter((r) => r.type === "ask").sort((a, b) => a.price - b.price);
  const bids = rows.filter((r) => r.type === "bid").sort((a, b) => b.price - a.price);
  const maxVol = Math.max(...rows.map((r) => r.volume), 1);

  const bgRow = (r: OrderBookRow) => {
    if (r.highlight === "xlarge") return r.type === "ask" ? "#4a0e0e" : "#0a3a0a";
    if (r.highlight === "large") return r.type === "ask" ? "#2a0808" : "#082008";
    return "transparent";
  };

  const decimals = midPrice >= 1000 ? 1 : midPrice >= 1 ? 3 : 5;

  const Row = ({ r }: { r: OrderBookRow }) => (
    <div
      className="relative flex justify-between px-1 py-[1px] text-[11px] hover:bg-white/[0.04] cursor-pointer"
      style={{ backgroundColor: bgRow(r) }}
    >
      <div
        className="absolute right-0 top-0 h-full opacity-[0.18]"
        style={{ width: `${(r.volume / maxVol) * 100}%`, backgroundColor: r.type === "ask" ? "#dc3232" : "#00c864" }}
      />
      <span className="relative z-10" style={{ color: r.type === "ask" ? "#ff5555" : "#44ff88" }}>
        {r.price.toFixed(decimals)}
      </span>
      <span className="relative z-10 text-[#666]">{fmtK(r.volume)}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="flex items-center justify-between px-2 py-[4px] border-b border-[#181818]">
        <span className="text-[11px] text-[#bbb] font-semibold tracking-wider">{symbol}</span>
        <span className="text-[10px] text-[#444]">Стакан</span>
      </div>
      <div className="flex justify-between px-1 py-[1px] text-[10px] text-[#333] border-b border-[#101010]">
        <span>Цена</span><span>Объём</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {asks.slice(0, 13).reverse().map((r, i) => <Row key={i} r={r} />)}
      </div>
      <div className="flex items-center justify-between px-2 py-[4px] bg-[#0a1a0a] border-y border-[#162016]">
        <span className="text-[13px] font-bold text-[#00ff88] blink">
          {midPrice >= 1000 ? midPrice.toFixed(1) : midPrice >= 1 ? midPrice.toFixed(3) : midPrice.toFixed(5)}
        </span>
        <span className="text-[10px] text-[#444]">live</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {bids.slice(0, 13).map((r, i) => <Row key={i} r={r} />)}
      </div>
    </div>
  );
}

// ── Ticker List ──────────────────────────────────────────────────
function TickerList({ tickers, selected, onSelect }: {
  tickers: Ticker[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="px-2 py-[4px] border-b border-[#181818] text-[10px] text-[#888] font-semibold tracking-[0.15em] uppercase">
        Рынок
      </div>
      <div className="flex px-1 py-[1px] text-[10px] text-[#333] border-b border-[#101010] gap-1">
        <span className="flex-1">Тикер</span>
        <span className="w-14 text-right">24h%</span>
        <span className="w-16 text-right">Цена</span>
      </div>
      <div className="flex-1 overflow-y-auto terminal-scroll">
        {tickers.length === 0 && (
          <div className="text-[10px] text-[#333] px-2 py-2">Загрузка...</div>
        )}
        {tickers.map((t, i) => (
          <div
            key={i}
            onClick={() => onSelect(t.symbol)}
            className={`flex items-center px-1 py-[2px] text-[11px] gap-1 cursor-pointer hover:bg-white/[0.04] ${selected === t.symbol ? "bg-[#0a180a]" : ""}`}
          >
            <span className="flex-1 text-[#ccc] truncate">{t.symbol}</span>
            <span className="w-14 text-right" style={{ color: t.change >= 0 ? "#44ff88" : "#ff5555" }}>
              {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
            </span>
            <span className="w-16 text-right text-[#666]">
              {t.bid >= 1000 ? t.bid.toFixed(1) : t.bid >= 1 ? t.bid.toFixed(3) : t.bid.toFixed(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Panel ────────────────────────────────────────────────
function HistoryPanel({ symbol, lastPrice }: { symbol: string; lastPrice: number }) {
  const decimals = lastPrice >= 1000 ? 1 : lastPrice >= 1 ? 3 : 5;
  const trades = [
    { time: "09:41", side: "BUY", price: lastPrice * 0.9994, pnl: +1.24 },
    { time: "09:38", side: "SELL", price: lastPrice * 1.0003, pnl: -0.87 },
    { time: "09:35", side: "BUY", price: lastPrice * 0.9988, pnl: +2.41 },
    { time: "09:30", side: "SELL", price: lastPrice * 1.0007, pnl: -1.12 },
    { time: "09:25", side: "BUY", price: lastPrice * 0.9991, pnl: +0.98 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="flex items-center justify-between px-3 py-[4px] border-b border-[#181818]">
        <span className="text-[10px] text-[#888] tracking-[0.15em] uppercase font-semibold">История</span>
        <span className="text-[12px] text-[#ddd] font-bold">баланс $150</span>
      </div>
      <div className="px-3 py-[2px] border-b border-[#101010] text-[11px] flex gap-2">
        <span className="text-[#666]">{symbol.toLowerCase()}/usdt</span>
        <span className="text-[#cc4444] cursor-pointer hover:text-[#ff7777]">отменить</span>
      </div>
      <div className="flex px-3 py-[1px] text-[10px] text-[#333] border-b border-[#0e0e0e] gap-2">
        <span className="w-10">Время</span>
        <span className="w-8">Тип</span>
        <span className="flex-1 text-right">Цена</span>
        <span className="w-12 text-right">PnL</span>
      </div>
      <div className="flex-1 overflow-y-auto terminal-scroll">
        {trades.map((t, i) => (
          <div key={i} className="flex items-center px-3 py-[2px] text-[11px] gap-2 hover:bg-white/[0.03]">
            <span className="w-10 text-[#444]">{t.time}</span>
            <span className="w-8" style={{ color: t.side === "BUY" ? "#44ff88" : "#ff5555" }}>{t.side}</span>
            <span className="flex-1 text-right text-[#888]">{t.price.toFixed(decimals)}</span>
            <span className="w-12 text-right" style={{ color: t.pnl >= 0 ? "#44ff88" : "#ff5555" }}>
              {t.pnl >= 0 ? "+" : ""}${Math.abs(t.pnl).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Terminal ────────────────────────────────────────────────
export default function Index() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState("5m");
  const [orderBook, setOrderBook] = useState<OrderBookRow[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [midPrice, setMidPrice] = useState(0);
  const [connected, setConnected] = useState(false);
  const [time, setTime] = useState(new Date());
  const wsRef = useRef<WebSocket | null>(null);

  const binanceSymbol = symbol + "USDT";

  // Load tickers once
  useEffect(() => {
    fetch24hTickers(TICKER_SYMBOLS).then(setTickers).catch(() => {});
    const iv = setInterval(() => {
      fetch24hTickers(TICKER_SYMBOLS).then(setTickers).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // Load candles on symbol/timeframe change
  useEffect(() => {
    setCandles([]);
    fetchKlines(binanceSymbol, timeframe, 60).then(setCandles).catch(() => {});
  }, [binanceSymbol, timeframe]);

  // Load order book snapshot on symbol change
  useEffect(() => {
    setOrderBook([]);
    fetchDepthSnapshot(binanceSymbol).then((snap) => {
      const asks = parseBook(snap.asks, "ask");
      const bids = parseBook(snap.bids, "bid");
      setOrderBook([...asks, ...bids]);
      if (bids[0]) setMidPrice(bids[0].price);
    }).catch(() => {});
  }, [binanceSymbol]);

  // WebSocket: depth + kline streams
  useEffect(() => {
    const sym = binanceSymbol.toLowerCase();
    const streams = [
      `${sym}@depth20@1000ms`,
      `${sym}@kline_${timeframe}`,
      `${sym}@trade`,
    ].join("/");

    const ws = new WebSocket(BINANCE_WS + streams);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const streamName: string = msg.stream ?? "";

      if (streamName.includes("@depth")) {
        const d = msg.data;
        if (d?.bids && d?.asks) {
          const asks = parseBook(d.asks, "ask");
          const bids = parseBook(d.bids, "bid");
          setOrderBook([...asks, ...bids]);
          if (bids[0]) setMidPrice(bids[0].price);
        }
      }

      if (streamName.includes("@kline")) {
        const k = msg.data?.k;
        if (k) {
          const newCandle: Candle = {
            time: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          };
          setCandles((prev) => {
            if (!prev.length) return [newCandle];
            const last = prev[prev.length - 1];
            if (last.time === newCandle.time) {
              return [...prev.slice(0, -1), newCandle];
            }
            return [...prev.slice(-59), newCandle];
          });
        }
      }

      if (streamName.includes("@trade")) {
        const price = parseFloat(msg.data?.p ?? "0");
        if (price) setMidPrice(price);
      }
    };

    return () => { ws.close(); };
  }, [binanceSymbol, timeframe]);

  // Clock
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const handleSelectSymbol = useCallback((sym: string) => {
    setSymbol(sym);
  }, []);

  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const currentTicker = tickers.find((t) => t.symbol === symbol);
  const pnlColor = (currentTicker?.change ?? 0) >= 0 ? "#44ff88" : "#ff5555";
  const decimals = midPrice >= 1000 ? 1 : midPrice >= 1 ? 3 : 5;

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#060606] flex flex-col" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-[4px] bg-[#040404] border-b border-[#161616] shrink-0">
        <div className="flex items-center gap-5">
          <span className="text-[12px] font-bold text-[#ddd] tracking-widest">{symbol}/USDT</span>
          {currentTicker && (
            <span className="text-[12px]" style={{ color: pnlColor }}>
              {currentTicker.change >= 0 ? "+" : ""}{currentTicker.change.toFixed(2)}%
            </span>
          )}
          <span className="text-[11px] text-[#00aaff] font-bold">
            {midPrice ? midPrice.toFixed(decimals) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <span
            className={`text-[9px] px-2 py-[1px] rounded-full border ${
              connected
                ? "text-[#44ff88] border-[#1a4a1a] bg-[#0a1a0a]"
                : "text-[#ff5555] border-[#4a1a1a] bg-[#1a0a0a]"
            }`}
          >
            {connected ? "● LIVE" : "● ОФФЛАЙН"}
          </span>
          <span className="text-[10px] text-[#444]">{timeStr}</span>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Order Book */}
        <div className="w-[178px] shrink-0 border-r border-[#121212]">
          <OrderBook rows={orderBook} midPrice={midPrice} symbol={`${symbol}/USDT`} />
        </div>

        {/* Chart + Controls */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#121212]">
          {/* Timeframe bar */}
          <div className="flex items-center gap-2 px-3 py-[3px] bg-[#050505] border-b border-[#161616] shrink-0">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`text-[10px] px-2 py-[1px] rounded-sm transition-colors ${
                  tf === timeframe
                    ? "bg-[#0d2a0d] text-[#44ff88] border border-[#1a4a1a]"
                    : "text-[#444] hover:text-[#888]"
                }`}
              >
                {tf}
              </button>
            ))}
            {candles.length > 0 && (
              <div className="ml-auto text-[9px] text-[#333] space-x-3">
                <span>O: {candles[candles.length - 1]?.open.toFixed(decimals)}</span>
                <span>H: {candles[candles.length - 1]?.high.toFixed(decimals)}</span>
                <span>L: {candles[candles.length - 1]?.low.toFixed(decimals)}</span>
                <span>C: {candles[candles.length - 1]?.close.toFixed(decimals)}</span>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="flex-1 overflow-hidden bg-[#050505]">
            <CandleChart candles={candles} pair={`${symbol}/USDT • ${timeframe}`} />
          </div>

          {/* Trade panel */}
          <div className="shrink-0 border-t border-[#161616] bg-[#040404] px-3 py-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#444] mr-1">Лот:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className="w-6 h-5 text-[10px] border border-[#1e1e1e] text-[#666] hover:border-[#444] hover:text-[#bbb] rounded-sm transition-colors"
                >
                  {n}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button className="px-5 py-[3px] text-[12px] font-bold bg-[#0a2e0a] text-[#44ff88] border border-[#145014] hover:bg-[#143c14] rounded-sm transition-colors">
                  BUY
                </button>
                <button className="px-5 py-[3px] text-[12px] font-bold bg-[#2e0a0a] text-[#ff5555] border border-[#501414] hover:bg-[#3c1414] rounded-sm transition-colors">
                  SELL
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="w-[210px] shrink-0 border-r border-[#121212]">
          <HistoryPanel symbol={symbol} lastPrice={midPrice || 1} />
        </div>

        {/* Ticker List */}
        <div className="w-[238px] shrink-0">
          <TickerList tickers={tickers} selected={symbol} onSelect={handleSelectSymbol} />
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-[3px] bg-[#030303] border-t border-[#161616]">
        {[`${symbol}/USDT`, "Стакан", "График"].map((tab, i) => (
          <button
            key={tab}
            className={`text-[11px] px-3 py-[2px] border-b-2 transition-colors ${
              i === 0 ? "border-[#44ff88] text-[#ddd]" : "border-transparent text-[#444] hover:text-[#888]"
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          {orderBook.filter((r) => r.type === "bid")[0] && (
            <>
              <span className="text-[#333]">
                bid: <span className="text-[#44ff88]">{orderBook.filter((r) => r.type === "bid")[0].price.toFixed(decimals)}</span>
              </span>
              <span className="text-[#333]">
                ask: <span className="text-[#ff5555]">{orderBook.filter((r) => r.type === "ask")[0]?.price.toFixed(decimals)}</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
