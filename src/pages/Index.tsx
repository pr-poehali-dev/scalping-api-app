import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "@/components/ui/icon";

// ── Types ───────────────────────────────────────────────────────
interface OrderBookRow {
  price: number;
  volume: number;
  type: "ask" | "bid";
}

interface Candle {
  open: number; high: number; low: number; close: number;
  volume: number; time: number;
}

interface Ticker {
  symbol: string; change: number; bid: number;
}

interface ActiveOrder {
  id: string;
  price: number;
  qty: number;
  side: "BUY" | "SELL";
}

interface BookSettings {
  lotSize: number;
  grouping: number;
  levels: number;
  showVolBar: boolean;
  largeLvl: number;
  xlargeLvl: number;
  flashOnTrade: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────
const fmtK = (v: number) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toFixed(2);
};
const priceStr = (p: number, d: number) => p.toFixed(d);
const BINANCE_WS = "wss://stream.binance.com:9443/stream?streams=";
const PROXY = "https://functions.poehali.dev/d688392a-2d9b-4201-8988-a60367144c87";

function binanceUrl(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ endpoint, ...params }).toString();
  return `${PROXY}?${qs}`;
}

async function fetchDepthSnapshot(sym: string) {
  const r = await fetch(binanceUrl("/api/v3/depth", { symbol: sym, limit: "20" }));
  return r.json() as Promise<{ bids: [string, string][]; asks: [string, string][] }>;
}
async function fetchKlines(sym: string, interval: string, limit = 60): Promise<Candle[]> {
  const r = await fetch(binanceUrl("/api/v3/klines", { symbol: sym, interval, limit: String(limit) }));
  const d: [number, string, string, string, string, string][] = await r.json();
  return d.map((k) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}
async function fetch24hTickers(symbols: string[]): Promise<Ticker[]> {
  const results = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(binanceUrl("/api/v3/ticker/24hr", { symbol: `${s}USDT` }));
        const t: { symbol: string; priceChangePercent: string; bidPrice: string } = await r.json();
        return { symbol: t.symbol.replace("USDT", ""), change: +t.priceChangePercent, bid: +t.bidPrice };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean) as Ticker[];
}
function parseRows(rows: [string, string][], type: "ask" | "bid"): OrderBookRow[] {
  return rows.slice(0, 25).map(([p, q]) => ({ price: +p, volume: +q, type }));
}

const TICKER_SYMS = ["BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","LINK","DOT","MATIC","LTC","UNI","ATOM","APT","ARB","OP","INJ","SUI","NEAR"];

// ── Candlestick Chart ────────────────────────────────────────────
function CandleChart({ candles, pair }: { candles: Candle[]; pair: string }) {
  const W = 640, H = 330;
  const PAD = { top: 10, right: 72, bottom: 18, left: 6 };
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom;
  if (!candles.length) return <div className="flex items-center justify-center h-full text-[#333] text-[11px]">Загрузка...</div>;
  const vis = candles.slice(-55);
  const maxH = Math.max(...vis.map(c => c.high)), minL = Math.min(...vis.map(c => c.low));
  const range = maxH - minL || 1;
  const cw = Math.max(2, Math.floor(chartW / vis.length) - 1);
  const toY = (v: number) => PAD.top + ((maxH - v) / range) * chartH;
  const step = range / 6;
  const lines = Array.from({ length: 7 }, (_, i) => minL + step * (6 - i));
  const last = vis[vis.length - 1].close;
  const d = last >= 1000 ? 1 : last >= 1 ? 2 : 4;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {lines.map((p, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(p)} x2={W - PAD.right} y2={toY(p)} stroke="#161616" strokeWidth="1" />
          <text x={W - PAD.right + 3} y={toY(p) + 4} fill="#444" fontSize="9" fontFamily="IBM Plex Mono">{p.toFixed(d)}</text>
        </g>
      ))}
      {vis.map((c, i) => {
        const x = PAD.left + i * (cw + 1);
        const green = c.close >= c.open;
        const col = green ? "#00c864" : "#dc3232";
        const bt = toY(Math.max(c.open, c.close));
        const bh = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
        const cx = x + cw / 2;
        return <g key={i}><line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={col} strokeWidth="1" /><rect x={x} y={bt} width={cw} height={bh} fill={col} opacity={0.9} /></g>;
      })}
      <line x1={PAD.left} y1={toY(last)} x2={W - PAD.right} y2={toY(last)} stroke="#0077cc" strokeWidth="1" strokeDasharray="3 3" />
      <rect x={W - PAD.right} y={toY(last) - 8} width={PAD.right - 2} height={16} fill="#003366" />
      <text x={W - PAD.right + 3} y={toY(last) + 4} fill="#00aaff" fontSize="9" fontFamily="IBM Plex Mono" fontWeight="600">{last.toFixed(d)}</text>
      <text x={PAD.left + 4} y={H - 4} fill="#333" fontSize="9" fontFamily="IBM Plex Mono">{pair}</text>
    </svg>
  );
}

// ── Settings Modal ───────────────────────────────────────────────
function SettingsModal({ settings, onChange, onClose }: {
  settings: BookSettings;
  onChange: (s: BookSettings) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(settings);
  const upd = (key: keyof BookSettings, val: BookSettings[keyof BookSettings]) => setS(prev => ({ ...prev, [key]: val }));

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-[5px] border-b border-[#141414]">
      <span className="text-[11px] text-[#888]">{label}</span>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative z-10 bg-[#0c0c0c] border border-[#222] rounded-sm shadow-2xl w-[300px]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <span className="text-[12px] text-[#ddd] font-semibold tracking-wider">Настройки стакана</span>
          <button onClick={onClose} className="text-[#555] hover:text-[#aaa]"><Icon name="X" size={14} /></button>
        </div>

        <div className="px-4 py-2 space-y-[2px]">
          <Row label="Размер лота (шт.)">
            <input
              type="number" min={1} value={s.lotSize}
              onChange={e => upd("lotSize", +e.target.value)}
              className="w-20 bg-[#161616] border border-[#2a2a2a] text-[#eee] text-[11px] px-2 py-[2px] text-right rounded-sm outline-none focus:border-[#44ff88]"
            />
          </Row>
          <Row label="Группировка цен">
            <select
              value={s.grouping}
              onChange={e => upd("grouping", +e.target.value)}
              className="w-20 bg-[#161616] border border-[#2a2a2a] text-[#eee] text-[11px] px-2 py-[2px] rounded-sm outline-none"
            >
              {[0, 1, 2, 5, 10].map(v => <option key={v} value={v}>{v === 0 ? "Авто" : v}</option>)}
            </select>
          </Row>
          <Row label="Уровней в стакане">
            <select
              value={s.levels}
              onChange={e => upd("levels", +e.target.value)}
              className="w-20 bg-[#161616] border border-[#2a2a2a] text-[#eee] text-[11px] px-2 py-[2px] rounded-sm outline-none"
            >
              {[8, 10, 13, 15, 20].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Row>
          <Row label="Крупный объём (≥)">
            <input
              type="number" min={1} value={s.largeLvl}
              onChange={e => upd("largeLvl", +e.target.value)}
              className="w-20 bg-[#161616] border border-[#2a2a2a] text-[#eee] text-[11px] px-2 py-[2px] text-right rounded-sm outline-none focus:border-[#e8c44a]"
            />
          </Row>
          <Row label="Очень крупный (≥)">
            <input
              type="number" min={1} value={s.xlargeLvl}
              onChange={e => upd("xlargeLvl", +e.target.value)}
              className="w-20 bg-[#161616] border border-[#2a2a2a] text-[#eee] text-[11px] px-2 py-[2px] text-right rounded-sm outline-none focus:border-[#ff5555]"
            />
          </Row>
          <Row label="Столбец объёма">
            <button
              onClick={() => upd("showVolBar", !s.showVolBar)}
              className={`w-9 h-5 rounded-full relative transition-colors ${s.showVolBar ? "bg-[#1a4a1a]" : "bg-[#222]"}`}
            >
              <span className={`absolute top-[2px] w-4 h-4 rounded-full transition-all ${s.showVolBar ? "left-[18px] bg-[#44ff88]" : "left-[2px] bg-[#555]"}`} />
            </button>
          </Row>
          <Row label="Мигание при сделке">
            <button
              onClick={() => upd("flashOnTrade", !s.flashOnTrade)}
              className={`w-9 h-5 rounded-full relative transition-colors ${s.flashOnTrade ? "bg-[#1a4a1a]" : "bg-[#222]"}`}
            >
              <span className={`absolute top-[2px] w-4 h-4 rounded-full transition-all ${s.flashOnTrade ? "left-[18px] bg-[#44ff88]" : "left-[2px] bg-[#555]"}`} />
            </button>
          </Row>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-[#1a1a1a]">
          <button
            onClick={() => { onChange(s); onClose(); }}
            className="flex-1 py-[5px] text-[11px] font-bold bg-[#0a2e0a] text-[#44ff88] border border-[#145014] hover:bg-[#143c14] rounded-sm"
          >
            Применить
          </button>
          <button onClick={onClose} className="px-4 py-[5px] text-[11px] text-[#555] hover:text-[#aaa] border border-[#1e1e1e] rounded-sm">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scalper Order Book ───────────────────────────────────────────
function ScalperBook({
  rows, midPrice, symbol, settings, orders, onPlace, onCancel,
}: {
  rows: OrderBookRow[];
  midPrice: number;
  symbol: string;
  settings: BookSettings;
  orders: ActiveOrder[];
  onPlace: (price: number, side: "BUY" | "SELL") => void;
  onCancel: (id: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [flashPrices, setFlashPrices] = useState<Set<number>>(new Set());
  const prevMid = useRef(midPrice);

  const decimals = midPrice >= 1000 ? 1 : midPrice >= 1 ? 3 : 5;
  const asks = rows.filter(r => r.type === "ask").sort((a, b) => a.price - b.price);
  const bids = rows.filter(r => r.type === "bid").sort((a, b) => b.price - a.price);
  const maxVol = Math.max(...rows.map(r => r.volume), 1);
  const visAsks = asks.slice(0, settings.levels);
  const visBids = bids.slice(0, settings.levels);

  // Flash mid price on change
  useEffect(() => {
    if (prevMid.current !== midPrice && settings.flashOnTrade) {
      setFlashPrices(prev => new Set([...prev, midPrice]));
      setTimeout(() => setFlashPrices(prev => { const n = new Set(prev); n.delete(midPrice); return n; }), 400);
    }
    prevMid.current = midPrice;
  }, [midPrice, settings.flashOnTrade]);

  const getOrderAtPrice = (price: number) => orders.find(o => Math.abs(o.price - price) < 0.0001);

  const handleRowClick = (price: number, side: "BUY" | "SELL") => {
    const existing = getOrderAtPrice(price);
    if (existing) { onCancel(existing.id); return; }
    onPlace(price, side);
  };

  const volBg = (r: OrderBookRow) => {
    const pct = (r.volume / maxVol) * 100;
    const col = r.type === "ask" ? "rgba(220,50,50,0.22)" : "rgba(0,200,100,0.22)";
    if (r.volume >= settings.xlargeLvl) return r.type === "ask" ? "rgba(220,50,50,0.45)" : "rgba(0,200,100,0.45)";
    if (r.volume >= settings.largeLvl) return r.type === "ask" ? "rgba(220,50,50,0.28)" : "rgba(0,200,100,0.28)";
    return "transparent";
  };

  const rowBorder = (r: OrderBookRow) => {
    if (r.volume >= settings.xlargeLvl) return r.type === "ask" ? "border-l-2 border-l-[#ff3333]" : "border-l-2 border-l-[#00ff88]";
    if (r.volume >= settings.largeLvl) return r.type === "ask" ? "border-l border-l-[#aa2222]" : "border-l border-l-[#22aa55]";
    return "";
  };

  const BookRow = ({ r, side }: { r: OrderBookRow; side: "BUY" | "SELL" }) => {
    const order = getOrderAtPrice(r.price);
    const isHovered = hoveredPrice === r.price;
    const volPct = Math.min((r.volume / maxVol) * 100, 100);

    return (
      <div
        className={`relative flex items-center px-0 h-[18px] cursor-pointer select-none group ${rowBorder(r)}`}
        style={{ backgroundColor: volBg(r) }}
        onMouseEnter={() => setHoveredPrice(r.price)}
        onMouseLeave={() => setHoveredPrice(null)}
        onClick={() => handleRowClick(r.price, side)}
      >
        {/* Volume bar */}
        {settings.showVolBar && (
          <div
            className="absolute right-0 top-0 h-full opacity-[0.15] pointer-events-none"
            style={{ width: `${volPct}%`, backgroundColor: r.type === "ask" ? "#dc3232" : "#00c864" }}
          />
        )}

        {/* Hover BUY/SELL hint */}
        {isHovered && !order && (
          <div className={`absolute left-0 top-0 h-full flex items-center px-1 text-[9px] font-bold z-20 ${
            side === "BUY" ? "text-[#44ff88]" : "text-[#ff5555]"
          }`}>
            {side}
          </div>
        )}

        {/* Active order indicator */}
        {order && (
          <div className={`absolute left-0 top-0 h-full w-full flex items-center px-1 z-20 pointer-events-none`}>
            <div className={`w-2 h-2 rounded-full mr-1 ${order.side === "BUY" ? "bg-[#44ff88]" : "bg-[#ff5555]"}`} />
            <span className={`text-[9px] font-bold ${order.side === "BUY" ? "text-[#44ff88]" : "text-[#ff5555]"}`}>
              {order.side} {order.qty}
            </span>
          </div>
        )}

        {/* Price */}
        <span
          className="relative z-10 pl-[6px] text-[11px] font-medium tabular-nums flex-1"
          style={{ color: r.type === "ask" ? (isHovered ? "#ff8888" : "#ff5555") : (isHovered ? "#88ffbb" : "#44ff88") }}
        >
          {priceStr(r.price, decimals)}
        </span>

        {/* Volume */}
        <span className="relative z-10 pr-[6px] text-[11px] tabular-nums text-[#555] group-hover:text-[#888]">
          {fmtK(r.volume)}
        </span>
      </div>
    );
  };

  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;

  return (
    <>
      <div className="flex flex-col h-full bg-[#070707]">

        {/* Header with gear */}
        <div className="flex items-center justify-between px-2 py-[3px] border-b border-[#181818] shrink-0">
          <span className="text-[10px] text-[#888] font-semibold tracking-wider">{symbol}</span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#333]">лот: <span className="text-[#555]">{settings.lotSize}</span></span>
            <button
              onClick={() => setShowSettings(true)}
              className="text-[#444] hover:text-[#aaa] transition-colors p-[2px]"
              title="Настройки стакана"
            >
              <Icon name="Settings" size={12} />
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex justify-between px-[6px] py-[1px] text-[9px] text-[#2a2a2a] border-b border-[#0e0e0e] shrink-0">
          <span>ЦЕНА</span><span>ОБЪЁМ</span>
        </div>

        {/* ASKS (sells) — price rises upward, so reverse for display */}
        <div className="flex flex-col justify-end overflow-hidden" style={{ flex: `0 0 ${settings.levels * 18}px` }}>
          {[...visAsks].reverse().map((r, i) => <BookRow key={i} r={r} side="SELL" />)}
        </div>

        {/* Spread / Mid row */}
        <div className="flex items-center justify-between px-2 py-[4px] bg-[#090f09] border-y border-[#162016] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold tabular-nums" style={{ color: "#00ff88" }}>
              {midPrice ? priceStr(midPrice, decimals) : "—"}
            </span>
            <span className="text-[9px] text-[#2a2a2a]">blink</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-[#2a2a2a]">спред</span>
            <span className="text-[10px] text-[#444]">{spread > 0 ? spread.toFixed(decimals) : "—"}</span>
          </div>
        </div>

        {/* BIDS (buys) */}
        <div className="flex flex-col overflow-hidden" style={{ flex: `0 0 ${settings.levels * 18}px` }}>
          {visBids.map((r, i) => <BookRow key={i} r={r} side="BUY" />)}
        </div>

        {/* Active orders panel */}
        {orders.length > 0 && (
          <div className="border-t border-[#161616] shrink-0">
            <div className="px-2 py-[2px] text-[9px] text-[#333] uppercase tracking-wider">Ордера</div>
            <div className="max-h-[80px] overflow-y-auto terminal-scroll">
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between px-2 py-[2px] hover:bg-white/[0.03]">
                  <span className={`text-[10px] font-bold ${o.side === "BUY" ? "text-[#44ff88]" : "text-[#ff5555]"}`}>{o.side}</span>
                  <span className="text-[10px] text-[#888] tabular-nums">{priceStr(o.price, decimals)}</span>
                  <span className="text-[10px] text-[#555]">{o.qty}</span>
                  <button
                    onClick={() => onCancel(o.id)}
                    className="text-[#333] hover:text-[#ff5555] ml-1"
                  >
                    <Icon name="X" size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer: click hint */}
        <div className="mt-auto px-2 py-[3px] border-t border-[#0e0e0e] shrink-0">
          <span className="text-[9px] text-[#222]">ЛКМ по bid → BUY • ЛКМ по ask → SELL</span>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={s => {}}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

// ── Ticker List ──────────────────────────────────────────────────
function TickerList({ tickers, selected, onSelect }: { tickers: Ticker[]; selected: string; onSelect: (s: string) => void }) {
  return (
    <div className="flex flex-col h-full bg-[#070707]">
      <div className="px-2 py-[4px] border-b border-[#181818] text-[10px] text-[#888] font-semibold tracking-[0.15em] uppercase">Рынок</div>
      <div className="flex px-1 py-[1px] text-[9px] text-[#2a2a2a] border-b border-[#101010] gap-1">
        <span className="flex-1">Тикер</span>
        <span className="w-14 text-right">24h%</span>
        <span className="w-16 text-right">Цена</span>
      </div>
      <div className="flex-1 overflow-y-auto terminal-scroll">
        {tickers.length === 0 && <div className="text-[10px] text-[#333] px-2 py-2">Загрузка...</div>}
        {tickers.map((t, i) => (
          <div
            key={i}
            onClick={() => onSelect(t.symbol)}
            className={`flex items-center px-1 py-[2px] text-[11px] gap-1 cursor-pointer hover:bg-white/[0.04] ${selected === t.symbol ? "bg-[#0a180a]" : ""}`}
          >
            <span className="flex-1 text-[#ccc] truncate">{t.symbol}</span>
            <span className="w-14 text-right tabular-nums" style={{ color: t.change >= 0 ? "#44ff88" : "#ff5555" }}>
              {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}%
            </span>
            <span className="w-16 text-right text-[#555] tabular-nums">
              {t.bid >= 1000 ? t.bid.toFixed(1) : t.bid >= 1 ? t.bid.toFixed(3) : t.bid.toFixed(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Panel ────────────────────────────────────────────────
function HistoryPanel({ symbol, lastPrice, orders, onCancel, onCancelAll }: {
  symbol: string; lastPrice: number; orders: ActiveOrder[];
  onCancel: (id: string) => void; onCancelAll: () => void;
}) {
  const d = lastPrice >= 1000 ? 1 : lastPrice >= 1 ? 3 : 5;

  return (
    <div className="flex flex-col h-full bg-[#070707]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-[4px] border-b border-[#181818] shrink-0">
        <span className="text-[10px] text-[#888] tracking-[0.15em] uppercase font-semibold">Мои ордера</span>
        <span className="text-[10px] text-[#555]">{symbol}/USDT</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-2 py-[2px] text-[9px] text-[#2a2a2a] border-b border-[#0e0e0e] gap-1 shrink-0">
        <span className="w-6"></span>
        <span className="w-8">Тип</span>
        <span className="flex-1 text-right">Цена</span>
        <span className="w-10 text-right">Кол-во</span>
        <span className="w-6"></span>
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto terminal-scroll">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#222]">
            <span className="text-[11px]">Нет активных ордеров</span>
            <span className="text-[9px] text-[#1a1a1a]">кликни по цене в стакане</span>
          </div>
        ) : (
          orders.map((o) => (
            <div
              key={o.id}
              className="flex items-center px-2 py-[3px] text-[11px] gap-1 hover:bg-white/[0.04] group border-b border-[#0d0d0d]"
            >
              {/* Side dot */}
              <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${o.side === "BUY" ? "bg-[#44ff88]" : "bg-[#ff5555]"}`} />
              {/* Side label */}
              <span className="w-8 font-bold" style={{ color: o.side === "BUY" ? "#44ff88" : "#ff5555" }}>
                {o.side}
              </span>
              {/* Price */}
              <span className="flex-1 text-right text-[#aaa] tabular-nums">{o.price.toFixed(d)}</span>
              {/* Qty */}
              <span className="w-10 text-right text-[#555] tabular-nums">{o.qty}</span>
              {/* Cancel */}
              <button
                onClick={() => onCancel(o.id)}
                className="w-6 flex items-center justify-center text-[#2a2a2a] hover:text-[#ff5555] transition-colors"
              >
                <Icon name="X" size={10} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer: cancel all */}
      {orders.length > 0 && (
        <div className="shrink-0 border-t border-[#161616] px-3 py-[5px] flex items-center justify-between">
          <span className="text-[10px] text-[#444]">{orders.length} орд.</span>
          <button
            onClick={onCancelAll}
            className="text-[10px] text-[#cc4444] hover:text-[#ff6666] transition-colors"
          >
            отменить все
          </button>
        </div>
      )}
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
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [bookSettings, setBookSettings] = useState<BookSettings>({
    lotSize: 1,
    grouping: 0,
    levels: 13,
    showVolBar: true,
    largeLvl: 15,
    xlargeLvl: 50,
    flashOnTrade: true,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const binSym = symbol + "USDT";

  // Tickers refresh
  useEffect(() => {
    fetch24hTickers(TICKER_SYMS).then(setTickers).catch(() => {});
    const iv = setInterval(() => fetch24hTickers(TICKER_SYMS).then(setTickers).catch(() => {}), 30000);
    return () => clearInterval(iv);
  }, []);

  // Candles
  useEffect(() => {
    setCandles([]);
    fetchKlines(binSym, timeframe, 60).then(setCandles).catch(() => {});
  }, [binSym, timeframe]);

  // Depth snapshot
  useEffect(() => {
    setOrderBook([]);
    fetchDepthSnapshot(binSym).then(snap => {
      setOrderBook([...parseRows(snap.asks, "ask"), ...parseRows(snap.bids, "bid")]);
      if (snap.bids[0]) setMidPrice(+snap.bids[0][0]);
    }).catch(() => {});
  }, [binSym]);

  // WebSocket
  useEffect(() => {
    const sym = binSym.toLowerCase();
    const streams = [`${sym}@depth20@500ms`, `${sym}@kline_${timeframe}`, `${sym}@trade`].join("/");
    const ws = new WebSocket(BINANCE_WS + streams);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const stream: string = msg.stream ?? "";
      if (stream.includes("@depth")) {
        const d = msg.data;
        if (d?.bids && d?.asks) {
          setOrderBook([...parseRows(d.asks, "ask"), ...parseRows(d.bids, "bid")]);
        }
      }
      if (stream.includes("@kline")) {
        const k = msg.data?.k;
        if (k) {
          const nc: Candle = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
          setCandles(prev => {
            if (!prev.length) return [nc];
            const last = prev[prev.length - 1];
            return last.time === nc.time ? [...prev.slice(0, -1), nc] : [...prev.slice(-59), nc];
          });
        }
      }
      if (stream.includes("@trade")) {
        const p = +msg.data?.p;
        if (p) setMidPrice(p);
      }
    };
    return () => ws.close();
  }, [binSym, timeframe]);

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const placeOrder = useCallback((price: number, side: "BUY" | "SELL") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveOrders(prev => [...prev, { id, price, qty: bookSettings.lotSize, side }]);
  }, [bookSettings.lotSize]);

  const cancelOrder = useCallback((id: string) => {
    setActiveOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const selectSymbol = useCallback((sym: string) => {
    setSymbol(sym);
    setActiveOrders([]);
  }, []);

  const cur = tickers.find(t => t.symbol === symbol);
  const decimals = midPrice >= 1000 ? 1 : midPrice >= 1 ? 3 : 5;
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#060606] flex flex-col" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-[4px] bg-[#040404] border-b border-[#161616] shrink-0">
        <div className="flex items-center gap-5">
          <span className="text-[12px] font-bold text-[#ddd] tracking-widest">{symbol}/USDT</span>
          {cur && (
            <span className="text-[12px]" style={{ color: cur.change >= 0 ? "#44ff88" : "#ff5555" }}>
              {cur.change >= 0 ? "+" : ""}{cur.change.toFixed(2)}%
            </span>
          )}
          <span className="text-[12px] font-bold text-[#00aaff] tabular-nums">
            {midPrice ? priceStr(midPrice, decimals) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {activeOrders.length > 0 && (
            <span className="text-[10px] text-[#e8c44a]">● {activeOrders.length} ордер(а)</span>
          )}
          <span className={`text-[9px] px-2 py-[1px] rounded-full border ${connected ? "text-[#44ff88] border-[#1a4a1a] bg-[#0a1a0a]" : "text-[#ff5555] border-[#4a1a1a] bg-[#1a0a0a]"}`}>
            {connected ? "● LIVE" : "● ОФФЛАЙН"}
          </span>
          <span className="text-[10px] text-[#444]">{timeStr}</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Scalper Order Book */}
        <div className="w-[190px] shrink-0 border-r border-[#121212]">
          <ScalperBook
            rows={orderBook}
            midPrice={midPrice}
            symbol={`${symbol}/USDT`}
            settings={bookSettings}
            orders={activeOrders}
            onPlace={placeOrder}
            onCancel={cancelOrder}
          />
        </div>

        {/* Chart */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#121212]">
          <div className="flex items-center gap-2 px-3 py-[3px] bg-[#050505] border-b border-[#161616] shrink-0">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`text-[10px] px-2 py-[1px] rounded-sm transition-colors ${tf === timeframe ? "bg-[#0d2a0d] text-[#44ff88] border border-[#1a4a1a]" : "text-[#444] hover:text-[#888]"}`}
              >
                {tf}
              </button>
            ))}
            {candles.length > 0 && (
              <div className="ml-auto text-[9px] text-[#333] space-x-2">
                <span>O:{candles[candles.length-1].open.toFixed(decimals)}</span>
                <span>H:{candles[candles.length-1].high.toFixed(decimals)}</span>
                <span>L:{candles[candles.length-1].low.toFixed(decimals)}</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-hidden bg-[#050505]">
            <CandleChart candles={candles} pair={`${symbol}/USDT • ${timeframe}`} />
          </div>
          {/* Quick lot panel */}
          <div className="shrink-0 border-t border-[#161616] bg-[#040404] px-3 py-[5px] flex items-center gap-3">
            <span className="text-[10px] text-[#333]">Лот:</span>
            {[1, 2, 5, 10, 20].map(n => (
              <button
                key={n}
                onClick={() => setBookSettings(s => ({ ...s, lotSize: n }))}
                className={`w-8 h-5 text-[10px] border rounded-sm transition-colors ${
                  bookSettings.lotSize === n
                    ? "border-[#44ff88] text-[#44ff88] bg-[#0a1a0a]"
                    : "border-[#1e1e1e] text-[#555] hover:border-[#444] hover:text-[#aaa]"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="ml-auto text-[9px] text-[#222]">Клик в стакане = лимитный ордер</span>
          </div>
        </div>

        {/* History */}
        <div className="w-[205px] shrink-0 border-r border-[#121212]">
          <HistoryPanel symbol={symbol} lastPrice={midPrice || 1} orders={activeOrders} onCancel={cancelOrder} onCancelAll={() => setActiveOrders([])} />
        </div>

        {/* Tickers */}
        <div className="w-[235px] shrink-0">
          <TickerList tickers={tickers} selected={symbol} onSelect={selectSymbol} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-[3px] bg-[#030303] border-t border-[#161616]">
        {[`${symbol}/USDT`, "Стакан", "График"].map((tab, i) => (
          <button key={tab} className={`text-[11px] px-3 py-[2px] border-b-2 transition-colors ${i === 0 ? "border-[#44ff88] text-[#ddd]" : "border-transparent text-[#444] hover:text-[#888]"}`}>
            {tab}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          {orderBook.filter(r => r.type === "bid")[0] && (
            <>
              <span className="text-[#2a2a2a]">bid: <span className="text-[#44ff88]">{orderBook.filter(r => r.type === "bid")[0].price.toFixed(decimals)}</span></span>
              <span className="text-[#2a2a2a]">ask: <span className="text-[#ff5555]">{orderBook.filter(r => r.type === "ask")[0]?.price.toFixed(decimals)}</span></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}