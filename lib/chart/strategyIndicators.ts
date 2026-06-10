import { CandlestickData, Time } from 'lightweight-charts';

// ── Bollinger Bands 계산 (SMA20 ± 2σ) ──
export function computeBollingerBands(
  candles: CandlestickData[],
  period = 20,
  mult = 2,
) {
  const upper: { time: Time; value: number; color?: string }[] = [];
  const middle: { time: Time; value: number; color?: string }[] = [];
  const lower: { time: Time; value: number; color?: string }[] = [];
  const bbwHistory: number[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const sma = sum / period;

    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (candles[j].close - sma) ** 2;
    const std = Math.sqrt(sqSum / period);
    const bbw = sma > 0 ? (2 * mult * std) / sma : 0;
    bbwHistory.push(bbw);

    const lookback = Math.min(bbwHistory.length, 200);
    const recent = bbwHistory.slice(-lookback);
    const rank = recent.filter(v => v <= bbw).length / lookback;
    const alpha = rank < 0.25 ? 0.65 : rank < 0.5 ? 0.35 : 0.12;

    const t = candles[i].time;
    upper.push({ time: t, value: sma + mult * std, color: `rgba(239, 68, 68, ${alpha})` });
    middle.push({ time: t, value: sma, color: `rgba(161, 161, 170, ${alpha})` });
    lower.push({ time: t, value: sma - mult * std, color: `rgba(59, 130, 246, ${alpha})` });
  }
  return { upper, middle, lower };
}

// ── RSI 계산 (Wilder's method, period=14) ──
export function computeRSI(
  candles: CandlestickData[],
  period = 14,
): { time: Time; value: number }[] {
  const closes = candles.map(c => c.close);
  if (closes.length < period + 1) return [];

  const result: { time: Time; value: number }[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[period].time, value: rsiVal });

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: v });
  }
  return result;
}

// ── RSI 피봇 & 다이버전스 감지 ──
export interface Pivot { idx: number; time: Time; price: number; rsi: number; }
export interface DivLine { p1: Pivot; p2: Pivot; type: 'bullish' | 'bearish'; }

export function detectDivergences(
  candles: CandlestickData[],
  rsiData: { time: Time; value: number }[],
  pivotLeft = 5,
  pivotRight = 2,
  rsiOversold = 30,
  rsiOverbought = 60,
  minRsiDiff = 2,
  minPriceDiffPct = 0.1,
): { pivotLows: Pivot[]; pivotHighs: Pivot[]; divLines: DivLine[] } {
  const rsiMap = new Map<number, number>();
  for (const r of rsiData) rsiMap.set(r.time as number, r.value);

  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const n = candles.length;

  const pivotLows: Pivot[] = [];
  for (let i = pivotLeft; i < n - pivotRight; i++) {
    const val = lows[i];
    let ok = true;
    for (let j = i - pivotLeft; j < i; j++) if (lows[j] < val) { ok = false; break; }
    if (!ok) continue;
    for (let j = i + 1; j <= i + pivotRight; j++) if (lows[j] < val) { ok = false; break; }
    if (!ok) continue;
    const rsi = rsiMap.get(candles[i].time as number);
    if (rsi !== undefined && rsi <= rsiOversold) {
      pivotLows.push({ idx: i, time: candles[i].time, price: val, rsi });
    }
  }

  const pivotHighs: Pivot[] = [];
  for (let i = pivotLeft; i < n - pivotRight; i++) {
    const val = highs[i];
    let ok = true;
    for (let j = i - pivotLeft; j < i; j++) if (highs[j] > val) { ok = false; break; }
    if (!ok) continue;
    for (let j = i + 1; j <= i + pivotRight; j++) if (highs[j] > val) { ok = false; break; }
    if (!ok) continue;
    const rsi = rsiMap.get(candles[i].time as number);
    if (rsi !== undefined && rsi >= rsiOverbought) {
      pivotHighs.push({ idx: i, time: candles[i].time, price: val, rsi });
    }
  }

  const divLines: DivLine[] = [];

  for (let i = 1; i < pivotLows.length; i++) {
    const prev = pivotLows[i - 1];
    const curr = pivotLows[i];
    const priceDiffPct = (prev.price - curr.price) / prev.price * 100;
    const rsiDiff = curr.rsi - prev.rsi;
    if (priceDiffPct >= minPriceDiffPct && rsiDiff >= minRsiDiff) {
      divLines.push({ p1: prev, p2: curr, type: 'bullish' });
    }
  }

  for (let i = 1; i < pivotHighs.length; i++) {
    const prev = pivotHighs[i - 1];
    const curr = pivotHighs[i];
    const priceDiffPct = (curr.price - prev.price) / prev.price * 100;
    const rsiDiff = prev.rsi - curr.rsi;
    if (priceDiffPct >= minPriceDiffPct && rsiDiff >= minRsiDiff) {
      divLines.push({ p1: prev, p2: curr, type: 'bearish' });
    }
  }

  return { pivotLows, pivotHighs, divLines };
}

// ── 돌파 레벨 계산 (20봉 고/저점) + 거래량 백분위 반전 색상 ──
export function computeBreakoutLevels(candles: CandlestickData[], period = 20) {
  const high: { time: Time; value: number; color?: string }[] = [];
  const low: { time: Time; value: number; color?: string }[] = [];
  const vrHistory: number[] = [];
  const alphaHistory: number[] = [];
  const SMOOTH = 10;

  for (let i = period; i < candles.length; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - period; j < i; j++) {
      if (candles[j].high > maxH) maxH = candles[j].high;
      if (candles[j].low < minL) minL = candles[j].low;
    }

    let volSum = 0;
    for (let j = i - period; j < i; j++) volSum += (candles[j] as any).volume ?? 0;
    const avgVol = volSum / period;
    const curVol = (candles[i] as any).volume ?? 0;
    const vr = avgVol > 0 ? curVol / avgVol : 1;
    vrHistory.push(vr);

    const lookback = Math.min(vrHistory.length, 200);
    const recent = vrHistory.slice(-lookback);
    const rank = recent.filter(v => v <= vr).length / lookback;

    const t1 = 1 - rank;
    const rawAlpha = 0.03 + 0.97 * t1 * t1 * t1;
    const k = 2 / (SMOOTH + 1);
    const prev = alphaHistory.length > 0 ? alphaHistory[alphaHistory.length - 1] : rawAlpha;
    const alpha = rawAlpha * k + prev * (1 - k);
    alphaHistory.push(alpha);

    const t = candles[i].time;
    high.push({ time: t, value: maxH, color: `rgba(34, 197, 94, ${alpha.toFixed(3)})` });
    low.push({ time: t, value: minL, color: `rgba(239, 68, 68, ${alpha.toFixed(3)})` });
  }
  return { high, low };
}

export function computeZScore(
  candles: CandlestickData[],
  period = 20,
): { time: Time; value: number }[] {
  const closes = candles.map(c => c.close);
  const result: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const sma = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (closes[j] - sma) ** 2;
    const std = Math.sqrt(sqSum / period);
    result.push({ time: candles[i].time, value: std > 0 ? (closes[i] - sma) / std : 0 });
  }
  return result;
}
