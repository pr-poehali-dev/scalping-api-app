import { useState, useEffect, useCallback } from "react";

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
const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`);
const rnd = (min: number, max: number) => Math.random() * (max - min) + min;

function genOrderBook(mid: number): OrderBookRow[] {
  const rows: OrderBookRow[] = [];
  let p = mid + 0.005;
  for (let i = 0; i < 18; i++) {
    const vol = Math.floor(rnd(500, 300000));
    rows.push({
      price: parseFloat(p.toFixed(4)),
      volume: vol,
      type: "ask",
      highlight: vol > 100000 ? "xlarge" : vol > 40000 ? "large" : undefined,
    });
    p += rnd(0.0002, 0.0008);
  }
  p = mid - 0.0005;
  for (let i = 0; i < 18; i++) {
    const vol = Math.floor(rnd(500, 300000));
    rows.push({
      price: parseFloat(p.toFixed(4)),
      volume: vol,
      type: "bid",
      highlight: vol > 100000 ? "xlarge" : vol > 40000 ? "large" : undefined,
    });
    p -= rnd(0.0002, 0.0008);
  }
  return rows;
}

function genCandles(base: number, count = 55): Candle[] {
  const candles: Candle[] = [];
  let price = base;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const open = price;
    const change = rnd(-0.4, 0.4);
    const close = open + change;
    const high = Math.max(open, close) + rnd(0, 0.15);
    const low = Math.min(open, close) - rnd(0, 0.15);
    candles.push({ open, high, low, close, volume: rnd(100, 2000), time: now - i * 5 * 60000 });
    price = close;
  }
  return candles;
}

const TICKERS: Ticker[] = [
  { symbol: "1000SHIB", change: -2.43, bid: 0.0217 },
  { symbol: "1000XEC", change: -5.27, bid: 0.0914 },
  { symbol: "1INCHU", change: -3.31, bid: 1.5319 },
  { symbol: "AAVEUSDT", change: -4.61, bid: 176.01 },
  { symbol: "ADABUSD", change: -2.91, bid: 0.9148 },
  { symbol: "ADAUSDT", change: -2.88, bid: 0.9148 },
  { symbol: "AKROUS", change: -6.22, bid: 0.0134 },
  { symbol: "ALGOUS", change: -3.08, bid: 0.7199 },
  { symbol: "ALICEUS", change: -3.67, bid: 6.611 },
  { symbol: "ALPHAU", change: -4.01, bid: 0.3856 },
  { symbol: "ANCUSDT", change: -3.82, bid: 2.066 },
  { symbol: "ANKRUS", change: 3.95, bid: 0.0712 },
  { symbol: "ANTUSDT", change: -3.89, bid: 4.298 },
  { symbol: "APEUSDT", change: -5.58, bid: 14.212 },
  { symbol: "APTUSDT", change: 1.24, bid: 8.45 },
  { symbol: "ARBUSDT", change: -2.11, bid: 1.234 },
  { symbol: "ATOMUSD", change: -1.88, bid: 10.21 },
  { symbol: "AVAXUSD", change: 0.77, bid: 36.48 },
];

// ── Candlestick Chart ────────────────────────────────────────────
function CandleChart({ candles, pair }: { candles: Candle[]; pair: string }) {
  const W = 640, H = 330;
  const PAD = { top: 10, right: 70, bottom: 18, left: 6 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (!candles.length) return null;

  const maxH = Math.max(...candles.map((c) => c.high));
  const minL = Math.min(...candles.map((c) => c.low));
  const range = maxH - minL || 1;

  const candleW = Math.max(2, Math.floor(chartW / candles.length) - 1);
  const toY = (v: number) => PAD.top + ((maxH - v) / range) * chartH;

  const priceStep = range / 6;
  const priceLines = Array.from({ length: 7 }, (_, i) => minL + priceStep * (6 - i));
  const lastClose = candles[candles.length - 1].close;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {priceLines.map((p, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(p)} x2={W - PAD.right} y2={toY(p)} stroke="#161616" strokeWidth="1" />
          <text x={W - PAD.right + 3} y={toY(p) + 4} fill="#444" fontSize="9" fontFamily="IBM Plex Mono">
            {p.toFixed(2)}
          </text>
        </g>
      ))}
      {candles.map((c, i) => {
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
      <line x1={PAD.left} y1={toY(lastClose)} x2={W - PAD.right} y2={toY(lastClose)} stroke="#0077cc" strokeWidth="1" strokeDasharray="3 3" />
      <rect x={W - PAD.right} y={toY(lastClose) - 8} width={PAD.right - 2} height={16} fill="#003366" />
      <text x={W - PAD.right + 3} y={toY(lastClose) + 4} fill="#00aaff" fontSize="9" fontFamily="IBM Plex Mono" fontWeight="600">
        {lastClose.toFixed(2)}
      </text>
      <text x={PAD.left + 4} y={H - 4} fill="#333" fontSize="9" fontFamily="IBM Plex Mono">{pair}</text>
    </svg>
  );
}

// ── Order Book ───────────────────────────────────────────────────
function OrderBook({ rows, midPrice, symbol }: { rows: OrderBookRow[]; midPrice: number; symbol: string }) {
  const asks = rows.filter((r) => r.type === "ask").sort((a, b) => a.price - b.price);
  const bids = rows.filter((r) => r.type === "bid").sort((a, b) => b.price - a.price);
  const maxVol = Math.max(...rows.map((r) => r.volume));

  const bgRow = (r: OrderBookRow) => {
    if (r.highlight === "xlarge") return r.type === "ask" ? "#4a0e0e" : "#0a3a0a";
    if (r.highlight === "large") return r.type === "ask" ? "#2a0808" : "#082008";
    return "transparent";
  };

  const Row = ({ r }: { r: OrderBookRow }) => (
    <div className="relative flex justify-between px-1 py-[1px] text-[11px] hover:bg-white/[0.04] cursor-pointer" style={{ backgroundColor: bgRow(r) }}>
      <div className="absolute right-0 top-0 h-full opacity-[0.18]" style={{ width: `${(r.volume / maxVol) * 100}%`, backgroundColor: r.type === "ask" ? "#dc3232" : "#00c864" }} />
      <span className="relative z-10" style={{ color: r.type === "ask" ? "#ff5555" : "#44ff88" }}>{fmt(r.price)}</span>
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
        <span className="text-[14px] font-bold text-[#00ff88] blink">{fmt(midPrice)}</span>
        <span className="text-[10px] text-[#444]">5x</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {bids.slice(0, 13).map((r, i) => <Row key={i} r={r} />)}
      </div>
    </div>
  );
}

// ── Ticker List ──────────────────────────────────────────────────
function TickerList({ tickers, selected, onSelect }: { tickers: Ticker[]; selected: string; onSelect: (s: string) => void }) {
  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="px-2 py-[4px] border-b border-[#181818] text-[10px] text-[#888] font-semibold tracking-[0.15em] uppercase">
        История
      </div>
      <div className="flex px-1 py-[1px] text-[10px] text-[#333] border-b border-[#101010] gap-1">
        <span className="flex-1">Тикер</span>
        <span className="w-14 text-right">Изм.</span>
        <span className="w-14 text-right">Спрос</span>
      </div>
      <div className="flex-1 overflow-y-auto terminal-scroll">
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
            <span className="w-14 text-right text-[#666]">{t.bid.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Panel ────────────────────────────────────────────────
function HistoryPanel({ balance, pair }: { balance: number; pair: string }) {
  const trades = [
    { time: "09:41", side: "BUY", qty: 1200, price: 0.3862, pnl: +1.24 },
    { time: "09:38", side: "SELL", qty: 800, price: 0.3875, pnl: -0.87 },
    { time: "09:35", side: "BUY", qty: 2000, price: 0.3848, pnl: +2.41 },
    { time: "09:30", side: "SELL", qty: 500, price: 0.3891, pnl: -1.12 },
    { time: "09:25", side: "BUY", qty: 1500, price: 0.3856, pnl: +0.98 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="flex items-center justify-between px-3 py-[4px] border-b border-[#181818]">
        <span className="text-[10px] text-[#888] tracking-[0.15em] uppercase font-semibold">История</span>
        <span className="text-[12px] text-[#ddd] font-bold">баланс ${balance}</span>
      </div>
      <div className="px-3 py-[2px] border-b border-[#101010] text-[11px] flex gap-2">
        <span className="text-[#888]">{pair.toLowerCase()}</span>
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
            <span className="flex-1 text-right text-[#999]">{t.price.toFixed(4)}</span>
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
  const [symbol, setSymbol] = useState("ALPHA/USDT");
  const [midPrice, setMidPrice] = useState(0.3858);
  const [orderBook, setOrderBook] = useState<OrderBookRow[]>(() => genOrderBook(0.3858));
  const [candles, setCandles] = useState<Candle[]>(() => genCandles(40400, 55));
  const [pnl] = useState(-3.65);
  const [time, setTime] = useState(new Date());
  const [timeframe, setTimeframe] = useState("5m");

  const updateMarket = useCallback(() => {
    const delta = rnd(-0.0004, 0.0004);
    setMidPrice((prev) => {
      const next = parseFloat((prev + delta).toFixed(4));
      setOrderBook(genOrderBook(next));
      return next;
    });
    setCandles((prev) => {
      const last = prev[prev.length - 1];
      const newClose = parseFloat((last.close + rnd(-0.12, 0.12)).toFixed(2));
      return [
        ...prev.slice(-54),
        { ...last, close: newClose, high: Math.max(last.high, newClose), low: Math.min(last.low, newClose) },
      ];
    });
  }, []);

  useEffect(() => {
    const iv = setInterval(updateMarket, 1100);
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(iv); clearInterval(clock); };
  }, [updateMarket]);

  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const btcPrice = candles[candles.length - 1]?.close.toFixed(2) ?? "40368.21";

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#060606] flex flex-col" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* ── Top Status Bar ── */}
      <div className="flex items-center justify-between px-4 py-[4px] bg-[#040404] border-b border-[#161616] shrink-0">
        <div className="flex items-center gap-5">
          <span className="text-[12px] font-bold text-[#ddd] tracking-widest">{symbol}</span>
          <span className="text-[12px]" style={{ color: pnl >= 0 ? "#44ff88" : "#ff4444" }}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
          </span>
          <span className="text-[11px] text-[#444]">0.0005</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[11px] text-[#0077cc]">BTC/USDT</span>
          <span className="text-[13px] font-bold text-[#44ff88]">{btcPrice}</span>
          <span className="text-[10px] text-[#444]">{timeStr}</span>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Order Book */}
        <div className="w-[175px] shrink-0 border-r border-[#121212]">
          <OrderBook rows={orderBook} midPrice={midPrice} symbol={symbol} />
        </div>

        {/* Chart Column */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#121212]">
          {/* Timeframe bar */}
          <div className="flex items-center gap-2 px-3 py-[3px] bg-[#050505] border-b border-[#161616] shrink-0">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`text-[10px] px-2 py-[1px] rounded-sm transition-colors ${
                  tf === timeframe ? "bg-[#0d2a0d] text-[#44ff88] border border-[#1a4a1a]" : "text-[#444] hover:text-[#888]"
                }`}
              >
                {tf}
              </button>
            ))}
            <div className="ml-auto text-[9px] text-[#333] space-x-3">
              <span>O: {candles[candles.length - 2]?.open.toFixed(2)}</span>
              <span>H: {candles[candles.length - 1]?.high.toFixed(2)}</span>
              <span>L: {candles[candles.length - 1]?.low.toFixed(2)}</span>
            </div>
          </div>

          {/* Chart area */}
          <div className="flex-1 overflow-hidden bg-[#050505]">
            <CandleChart candles={candles} pair={`BTC/USDT ${timeframe}`} />
          </div>

          {/* Buy/Sell panel */}
          <div className="shrink-0 border-t border-[#161616] bg-[#040404] px-3 py-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#444] mr-1">Лот:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="w-6 h-5 text-[10px] border border-[#1e1e1e] text-[#666] hover:border-[#444] hover:text-[#bbb] rounded-sm transition-colors">
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

        {/* History Panel */}
        <div className="w-[210px] shrink-0 border-r border-[#121212]">
          <HistoryPanel balance={150} pair="btc/usdt" />
        </div>

        {/* Ticker List */}
        <div className="w-[235px] shrink-0">
          <TickerList
            tickers={TICKERS}
            selected={symbol.replace("/USDT", "USDT").replace("/", "")}
            onSelect={(s) => setSymbol(s + "/USDT")}
          />
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-[3px] bg-[#030303] border-t border-[#161616]">
        {[symbol, "Стакан", "BTC/USDT"].map((tab, i) => (
          <button
            key={tab}
            className={`text-[11px] px-3 py-[2px] border-b-2 transition-colors ${
              i === 0
                ? "border-[#44ff88] text-[#ddd]"
                : "border-transparent text-[#444] hover:text-[#888]"
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          <span className="text-[#333]">bid: <span className="text-[#555]">{fmt(midPrice - 0.0003)}</span></span>
          <span className="text-[#333]">ask: <span className="text-[#555]">{fmt(midPrice + 0.0003)}</span></span>
          <span className="text-[#222]">спред: <span className="text-[#444]">{fmt(0.0006)}</span></span>
        </div>
      </div>
    </div>
  );
}
