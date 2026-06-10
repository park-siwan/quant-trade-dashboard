'use client';

import { atom } from 'jotai';
import type {
  TickerData,
  KlineData,
  OrderBookData,
  BackendMTFData,
  LiquidationData,
  WhaleData,
  FundingRateData,
  CoinglassData,
  LongShortRatioData,
  BalanceData,
  TradingStatus,
  RealtimeDivergenceData,
  IndicatorSnapshot,
  SignalStats,
} from '@/contexts/SocketContext';

// ── Connection ────────────────────────────────────────────────────────────────
export const isConnectedAtom = atom<boolean>(false);
export const wakeUpCounterAtom = atom<number>(0);

// ── Ticker ────────────────────────────────────────────────────────────────────
export const tickerAtom = atom<TickerData | null>(null);

// ── Kline ─────────────────────────────────────────────────────────────────────
export const klineAtom = atom<KlineData | null>(null);
export const klineMapAtom = atom<Map<string, KlineData>>(new Map());

// ── Market data ───────────────────────────────────────────────────────────────
export const orderbookAtom = atom<OrderBookData | null>(null);
export const mtfDataAtom = atom<BackendMTFData | null>(null);
export const lastMtfUpdateAtom = atom<number>(0);
export const liquidationDataAtom = atom<LiquidationData | null>(null);
export const whaleDataAtom = atom<WhaleData | null>(null);
export const fundingRateDataAtom = atom<FundingRateData | null>(null);
export const coinglassDataAtom = atom<CoinglassData | null>(null);
export const longShortRatioDataAtom = atom<LongShortRatioData | null>(null);
export const balanceDataAtom = atom<BalanceData | null>(null);

// ── Trading & signals ─────────────────────────────────────────────────────────
export const tradingStatusAtom = atom<TradingStatus | null>(null);
export const divergenceDataAtom = atom<RealtimeDivergenceData | null>(null);
export const divergenceHistoryAtom = atom<RealtimeDivergenceData[]>([]);
export const indicatorSnapshotAtom = atom<IndicatorSnapshot | null>(null);
export const signalStatsAtom = atom<SignalStats | null>(null);

// ── Reset: 심볼 변경 시 심볼 종속 데이터 일괄 초기화 ─────────────────────────
export const resetSocketSymbolDataAtom = atom(null, (_get, set) => {
  set(tickerAtom, null);
  set(klineAtom, null);
  set(klineMapAtom, new Map());
  set(orderbookAtom, null);
  set(mtfDataAtom, null);
  set(lastMtfUpdateAtom, 0);
  set(liquidationDataAtom, null);
  set(whaleDataAtom, null);
  set(fundingRateDataAtom, null);
  set(coinglassDataAtom, null);
  set(longShortRatioDataAtom, null);
  set(divergenceDataAtom, null);
  set(divergenceHistoryAtom, []);
});
