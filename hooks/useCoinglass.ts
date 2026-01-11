'use client';

import { usePolling } from './usePolling';
import { POLLING_INTERVALS } from '@/lib/config';

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
}

export interface CoinglassTradingSignals {
  symbol: string;
  fearGreed: FearGreedData | null;
  liquidationBias: 'long_heavy' | 'short_heavy' | 'neutral';
  bullMarketRisk: number;
  etfTrend: 'inflow' | 'outflow' | 'neutral';
}

interface UseCoinglassParams {
  symbol?: string;
  refreshInterval?: number;
}

export function useCoinglass({
  symbol = 'BTC',
  refreshInterval = POLLING_INTERVALS.COINGLASS,
}: UseCoinglassParams = {}) {
  return usePolling<CoinglassTradingSignals>({
    endpoint: '/exchange/coinglass/trading-signals',
    params: { symbol },
    refreshInterval,
  });
}
