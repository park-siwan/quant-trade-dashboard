import { atom } from 'jotai';
import type { SavedOptimizeResult, TradeResult, SkippedSignal } from '@/lib/backtest-api';

export const timeframeAtom = atom('5m');
export const selectedStrategyAtom = atom<SavedOptimizeResult | null>(null);
export const selectedTradeAtom = atom<TradeResult | null>(null);
export const highlightedStrategyAtom = atom<number | null>(null);

export const hoveredTradeAtom = atom<TradeResult | null>(null);
export const hoveredSkippedAtom = atom<SkippedSignal | null>(null);
export const tooltipPosAtom = atom<{ x: number; y: number } | null>(null);

export const isSettingsOpenAtom = atom(false);
export const leverageAtom = atom(20);
export const nextCandleCountdownAtom = atom(0);

export const strategyChartTabAtom = atom<'equity' | 'sharpe' | 'avg-sharpe' | null>(null);
export const refreshingStrategyAtom = atom<string | null>(null);
